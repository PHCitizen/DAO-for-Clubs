import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { getContract, toFunctionSelector, type Address, type Hex } from 'viem'
import { deployTestFixture, loadArtifact } from './fixtures.js'

const MODE = { Revert: 0, ReturnFalse: 1, Reenter: 2 } as const
const AMOUNT = 40n * 10n ** 18n

/** A DAO whose funding asset passes the balance check but fails or abuses `transfer`. */
async function setup(connection: Awaited<ReturnType<typeof network.create>>) {
  const f = await deployTestFixture(connection.provider as any)
  const tokenArtifact = await loadArtifact('MisbehavingFundingToken', 'test-doubles/MisbehavingFundingToken.sol')
  const mine = async (hash: Promise<Hex>) => f.publicClient.waitForTransactionReceipt({ hash: await hash })
  const deploy = async (abi: any, bytecode: Hex, args: unknown[]) =>
    (await f.publicClient.waitForTransactionReceipt({ hash: await f.walletClients[0].deployContract({ abi, bytecode, args } as any) })).contractAddress!
  const tokenAddress = await deploy(tokenArtifact.abi, tokenArtifact.bytecode, [])
  const daoAddress = await deploy(f.daoArtifact.abi, f.daoArtifact.bytecode, [tokenAddress])
  const dao = (wallet: number) => getContract({ address: daoAddress, abi: f.daoArtifact.abi, client: { public: f.publicClient, wallet: f.walletClients[wallet] } })
  const token = getContract({ address: tokenAddress, abi: tokenArtifact.abi, client: { public: f.publicClient, wallet: f.walletClients[0] } })
  const creator = 1, voter = 3

  await mine(dao(0).write.createTreasury())
  const treasury = (await dao(0).read.getTreasuries() as Address[]).at(-1)!
  const membership = getContract({ address: treasury, abi: f.treasuryArtifact.abi, client: { public: f.publicClient, wallet: f.walletClients[0] } })
  await mine(membership.write.mintVotingNft([f.accounts[voter]]))
  const deadline = (await f.publicClient.getBlock()).timestamp + 3600n
  await mine(dao(creator).write.createProposal([treasury, AMOUNT, deadline, 'ipfs://document']))
  const id = await dao(0).read.proposalCount() as bigint
  await mine(dao(voter).write.voteYes([id, 1n]))
  return { mine, dao, token, creator, id, daoAddress }
}

test('a funding token that fails the transfer leaves nothing paid and the proposal retryable', async (t) => {
  for (const [name, mode] of [['reverting', MODE.Revert], ['false-returning', MODE.ReturnFalse]] as const) {
    await t.test(`${name} token: no payment, flag unset, passing intact, distinct event`, async () => {
      const connection = await network.create('default')
      try {
        const { mine, dao, token, creator, id, daoAddress } = await setup(connection)
        await mine(token.write.configure([mode, daoAddress, id]))
        const receipt = await mine(dao(creator).write.releaseFunds([id]))
        assert.equal(receipt.status, 'success')
        assert.equal(await dao(0).read.fundsReleased([id]), false)
        assert.deepEqual(await dao(0).read.getVoting([id]), [1n, 1n, true, false, 0n])
        const range = { fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber }
        assert.equal((await dao(0).getEvents.FundsReleased({}, range)).length, 0)
        assert.equal((await dao(0).getEvents.FundingShortage({}, range)).length, 0, 'a token failure is not a balance shortage')
        const failed = await dao(0).getEvents.FundsTransferFailed({}, range)
        assert.equal(failed.length, 1)
        assert.equal((failed[0].args as { proposalId: bigint }).proposalId, id)
        // Not stuck: the lock was released, so the creator can retry.
        const retry = await mine(dao(creator).write.releaseFunds([id]))
        assert.equal(retry.status, 'success')
        assert.equal(await dao(0).read.fundsReleased([id]), false)
      } finally { await connection.close() }
    })
  }
})

test('re-entering releaseFunds from the asset is rejected and the payment happens exactly once', async () => {
  const connection = await network.create('default')
  try {
    const { mine, dao, token, creator, id, daoAddress } = await setup(connection)
    await mine(token.write.configure([MODE.Reenter, daoAddress, id]))
    const receipt = await mine(dao(creator).write.releaseFunds([id]))
    assert.equal(await token.read.reentrySucceeded(), false)
    assert.equal(await token.read.reentryRevertData(), toFunctionSelector('ReentrantCall()'))
    assert.equal(await dao(0).read.fundsReleased([id]), true)
    const range = { fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber }
    assert.equal((await dao(0).getEvents.FundsReleased({}, range)).length, 1)
  } finally { await connection.close() }
})
