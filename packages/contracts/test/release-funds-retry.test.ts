import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { encodeFunctionData, getContract, type Address, type Hex } from 'viem'
import { createApplication } from '../../frontend/src/application.ts'
import { deployTestFixture, loadArtifact } from './fixtures.js'

const UNIT = 10n ** 18n
const MODE = { Revert: 0, Reenter: 2 } as const

type Connection = Awaited<ReturnType<typeof network.create>>

/** Application wired to a real local chain, acting as `account`. */
function appFor(connection: Connection, f: Awaited<ReturnType<typeof deployTestFixture>>, account: Address, assetAddress: Address, daoAddress: Address) {
  return createApplication({
    connect: async () => account, disconnect: async () => {}, isAvailable: () => true,
    getAccount: async () => account, getChainId: async () => 31337,
    onAccountChanged: () => () => {}, onChainChanged: () => () => {}, switchChain: async () => {},
    signMessage: async () => { throw new Error('signing is not used by fund release') },
    sendTransaction: async request => connection.provider.request({ method: 'eth_sendTransaction', params: [{
      from: request.from, to: request.to,
      data: encodeFunctionData({ abi: request.abi, functionName: request.functionName, args: request.args }),
    }] }) as Promise<Hex>,
  }, {
    getChainId: () => f.publicClient.getChainId(),
    getBlockNumber: () => f.publicClient.getBlockNumber(),
    readContract: request => f.publicClient.readContract(request as any) as any,
    waitForTransactionReceipt: hash => f.publicClient.waitForTransactionReceipt({ hash }),
  }, { chainId: 31337, daoAddress, testUsdAddress: assetAddress, rpcUrl: 'http://127.0.0.1:8545' })
}

test('retry after a funding shortage: replenish, no new vote, even after vote close, exactly once', async (t) => {
  const connection = await network.create('default')
  try {
    const f = await deployTestFixture(connection.provider as any)
    const mine = async (hash: Promise<Hex>) => f.publicClient.waitForTransactionReceipt({ hash: await hash })
    const dao = (wallet: number) => getContract({ address: f.daoAddress, abi: f.daoArtifact.abi,
      client: { public: f.publicClient, wallet: f.walletClients[wallet] } })
    const asset = getContract({ address: f.testUsdAddress, abi: f.testUsdArtifact.abi,
      client: { public: f.publicClient, wallet: f.walletClients[0] } })
    const creator = 1, voter = 3, stranger = 4
    const balance = (who: Address) => asset.read.balanceOf([who]) as Promise<bigint>
    const app = appFor(connection, f, f.accounts[creator], f.testUsdAddress, f.daoAddress)
    const strangerApp = appFor(connection, f, f.accounts[stranger], f.testUsdAddress, f.daoAddress)
    await app.connect(); await strangerApp.connect()

    async function proposalOn(amount: bigint, funding: bigint, treasuryAddress?: Address) {
      let address = treasuryAddress
      if (!address) {
        await mine(dao(0).write.createTreasury())
        address = (await dao(0).read.getTreasuries() as Address[]).at(-1)!
        const membership = getContract({ address, abi: f.treasuryArtifact.abi, client: { public: f.publicClient, wallet: f.walletClients[0] } })
        await mine(membership.write.mintVotingNft([f.accounts[voter]]))
      }
      if (funding > 0n) await mine(asset.write.mint([address, funding]))
      const deadline = (await f.publicClient.getBlock()).timestamp + 3600n
      await mine(dao(creator).write.createProposal([address, amount, deadline, 'ipfs://document']))
      const id = await dao(0).read.proposalCount() as bigint
      return { address, id, deadline }
    }
    const state = async (id: bigint) => {
      const read = await app.readFunding(id)
      return read.status === 'success' ? read.funding.state : read.status
    }
    const closeVoting = async (deadline: bigint) => {
      await connection.provider.request({ method: 'evm_setNextBlockTimestamp', params: [Number(deadline)] })
      await connection.provider.request({ method: 'evm_mine' })
    }

    await t.test('shortage, replenishment and retry after vote close pay once without another vote', async () => {
      const { address, id, deadline } = await proposalOn(30n * UNIT, 10n * UNIT)
      assert.equal(await state(id), 'not-passed')
      await mine(dao(voter).write.voteYes([id, 1n]))
      assert.equal(await state(id), 'passed-awaiting-funds')

      await closeVoting(deadline)
      const before = await balance(f.accounts[creator])
      const short = await app.releaseFunds(id)
      assert.equal(short.status, 'funds-pending')
      assert.equal(await balance(f.accounts[creator]), before, 'no partial payment')
      assert.equal(await balance(address), 10n * UNIT)
      assert.equal(await dao(0).read.fundsReleased([id]), false)
      assert.equal(await state(id), 'passed-awaiting-funds')

      // Replenishment by anyone, directly; the state follows the balance at read time.
      await mine(asset.write.mint([address, 25n * UNIT]))
      assert.equal(await state(id), 'payment-pending')
      assert.deepEqual(await dao(0).read.getVoting([id]), [1n, 1n, true, false, 0n])

      // Unauthorized retries change nothing.
      assert.equal((await strangerApp.releaseFunds(id)).status, 'transaction-failed')
      assert.equal(await balance(address), 35n * UNIT)

      const paid = await app.releaseFunds(id)
      assert.equal(paid.status, 'confirmed')
      assert.equal(await balance(f.accounts[creator]) - before, 30n * UNIT)
      assert.equal(await balance(address), 5n * UNIT)
      assert.equal(await state(id), 'paid')

      // Repeat request after payment: rejected, nothing moves.
      assert.equal((await app.releaseFunds(id)).status, 'transaction-failed')
      assert.equal(await balance(f.accounts[creator]) - before, 30n * UNIT)
      assert.equal(await balance(address), 5n * UNIT)
      assert.equal(await state(id), 'paid')
    })

    await t.test('competing passed proposals: passing reserves nothing, the loser waits then retries', async () => {
      const first = await proposalOn(60n * UNIT, 100n * UNIT)
      const second = await proposalOn(60n * UNIT, 0n, first.address)
      await mine(dao(voter).write.voteYes([first.id, 1n]))
      await mine(dao(voter).write.voteYes([second.id, 1n]))
      assert.equal(await state(first.id), 'payment-pending')
      assert.equal(await state(second.id), 'payment-pending')

      assert.equal((await app.releaseFunds(second.id)).status, 'confirmed')
      // Execution-time balance: the other proposal's earlier "enough funds" view is now stale.
      assert.equal(await state(first.id), 'passed-awaiting-funds')
      assert.equal((await app.releaseFunds(first.id)).status, 'funds-pending')
      assert.equal(await balance(first.address), 40n * UNIT)

      await mine(asset.write.mint([first.address, 20n * UNIT]))
      assert.equal((await app.releaseFunds(first.id)).status, 'confirmed')
      assert.equal(await balance(first.address), 0n)
      assert.equal(await state(first.id), 'paid')
      assert.equal(await state(second.id), 'paid')
    })
  } finally { await connection.close() }
})

test('a failed asset transfer is payment-failed, distinct from a shortage, and a retry can still pay', async () => {
  const connection = await network.create('default')
  try {
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
    await mine(dao(creator).write.createProposal([treasury, 40n * UNIT, deadline, 'ipfs://document']))
    const id = await dao(0).read.proposalCount() as bigint
    await mine(dao(voter).write.voteYes([id, 1n]))
    const app = appFor(connection, f, f.accounts[creator], tokenAddress, daoAddress)
    await app.connect()
    const state = async () => { const r = await app.readFunding(id); return r.status === 'success' ? r.funding.state : r.status }

    assert.equal(await state(), 'payment-pending')
    await mine(token.write.configure([MODE.Revert, daoAddress, id]))
    assert.equal((await app.releaseFunds(id)).status, 'funds-pending')
    assert.equal(await state(), 'payment-failed')
    assert.equal(await dao(0).read.fundsReleased([id]), false)

    // The asset recovers (re-entry with an unknown proposal id is rejected harmlessly); the same proposal pays.
    await mine(token.write.configure([MODE.Reenter, daoAddress, 0n]))
    assert.equal((await app.releaseFunds(id)).status, 'confirmed')
    assert.equal(await state(), 'paid')
  } finally { await connection.close() }
})
