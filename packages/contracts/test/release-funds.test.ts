import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { encodeFunctionData, getAddress, getContract, type Address, type Hex } from 'viem'
import { createApplication } from '../../frontend/src/application.ts'
import { deployTestFixture } from './fixtures.js'

const UNIT = 10n ** 18n

test('creator releases a passed proposal exactly once, even after vote close', async (t) => {
  const connection = await network.create('default')
  try {
    const f = await deployTestFixture(connection.provider as any)
    const mine = async (hash: Promise<Hex>) => f.publicClient.waitForTransactionReceipt({ hash: await hash })
    const dao = (wallet: number) => getContract({ address: f.daoAddress, abi: f.daoArtifact.abi,
      client: { public: f.publicClient, wallet: f.walletClients[wallet] } })
    const asset = getContract({ address: f.testUsdAddress, abi: f.testUsdArtifact.abi,
      client: { public: f.publicClient, wallet: f.walletClients[0] } })
    const creator = 1, voter = 3, stranger = 4
    /** Proposal on a one-member treasury (token 1), funded with `funding`; reuses `treasuryAddress` when given. */
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
    const balance = (who: Address) => asset.read.balanceOf([who]) as Promise<bigint>
    const released = (id: bigint) => dao(0).read.fundsReleased([id]) as Promise<boolean>
    const closeVoting = async (deadline: bigint) => {
      await connection.provider.request({ method: 'evm_setNextBlockTimestamp', params: [Number(deadline)] })
      await connection.provider.request({ method: 'evm_mine' })
    }

    await t.test('after vote close the creator collects the exact fixed amount, once', async () => {
      const { address, id, deadline } = await proposalOn(40n * UNIT, 100n * UNIT)
      await mine(dao(voter).write.voteYes([id, 1n]))
      await closeVoting(deadline)
      const creatorBefore = await balance(f.accounts[creator])
      await mine(dao(creator).write.releaseFunds([id]))
      assert.equal(await balance(f.accounts[creator]) - creatorBefore, 40n * UNIT)
      assert.equal(await balance(address), 60n * UNIT)
      assert.equal(await released(id), true)
      const logsBefore = await f.publicClient.getLogs({ address: [f.daoAddress, f.testUsdAddress], fromBlock: 0n })
      await assert.rejects(dao(creator).write.releaseFunds([id]), /FundsAlreadyReleased/)
      assert.equal(await balance(f.accounts[creator]) - creatorBefore, 40n * UNIT, 'duplicate request pays the recipient nothing more')
      assert.equal(await balance(address), 60n * UNIT, 'duplicate request takes nothing more from the treasury')
      assert.deepEqual(await f.publicClient.getLogs({ address: [f.daoAddress, f.testUsdAddress], fromBlock: 0n }), logsBefore, 'no transfer or event')
    })

    await t.test('wrong caller, unpassed and never-passed proposals change nothing', async () => {
      const { address, id } = await proposalOn(10n * UNIT, 100n * UNIT)
      await assert.rejects(dao(creator).write.releaseFunds([id]), /ProposalNotPassed/)
      await mine(dao(voter).write.voteYes([id, 1n]))
      for (const caller of [stranger, voter, 0]) {
        await assert.rejects(dao(caller).write.releaseFunds([id]), /NotProposalCreator/)
      }
      assert.equal(await balance(address), 100n * UNIT)
      assert.equal(await released(id), false)

      const never = await proposalOn(10n * UNIT, 0n, address)
      await closeVoting(never.deadline)
      await assert.rejects(dao(creator).write.releaseFunds([never.id]), /ProposalNotPassed/)
      await assert.rejects(dao(creator).write.releaseFunds([999n]), /ProposalNotFound/)
      assert.equal(await balance(address), 100n * UNIT)
      assert.equal(await released(never.id), false)
    })

    await t.test('treasury payout accepts only the DAO, never the administrator or others', async () => {
      const { address } = await proposalOn(10n * UNIT, 100n * UNIT)
      const treasury = (wallet: number) => getContract({ address, abi: f.treasuryArtifact.abi, client: { public: f.publicClient, wallet: f.walletClients[wallet] } })
      for (const caller of [0, creator, stranger]) {
        await assert.rejects(treasury(caller).write.releaseFunds([f.accounts[caller], 1n]), /UnauthorizedCaller/)
      }
      assert.equal(await balance(address), 100n * UNIT)
    })

    await t.test('a funding shortage moves nothing, keeps the passing record and is not reported as paid', async () => {
      const { address, id } = await proposalOn(70n * UNIT, 50n * UNIT)
      await mine(dao(voter).write.voteYes([id, 1n]))
      const creatorBefore = await balance(f.accounts[creator])
      const receipt = await mine(dao(creator).write.releaseFunds([id]))
      assert.equal(receipt.status, 'success')
      assert.equal(await balance(f.accounts[creator]), creatorBefore)
      assert.equal(await balance(address), 50n * UNIT)
      assert.equal(await released(id), false)
      assert.deepEqual(await dao(0).read.getVoting([id]), [1n, 1n, true, false, 0n])
      const range = { fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber }
      assert.equal((await dao(0).getEvents.FundsReleased({}, range)).length, 0)
      assert.equal((await dao(0).getEvents.FundingShortage({}, range)).length, 1)
    })

    await t.test('two passed proposals share a treasury; the actual balance at execution decides', async () => {
      const first = await proposalOn(60n * UNIT, 100n * UNIT)
      const second = await proposalOn(60n * UNIT, 0n, first.address)
      await mine(dao(voter).write.voteYes([first.id, 1n]))
      await mine(dao(voter).write.voteYes([second.id, 1n]))
      const before = await balance(f.accounts[creator])
      await mine(dao(creator).write.releaseFunds([second.id]))
      assert.equal(await balance(f.accounts[creator]) - before, 60n * UNIT)
      await mine(dao(creator).write.releaseFunds([first.id]))
      assert.equal(await balance(f.accounts[creator]) - before, 60n * UNIT, 'only 40 remained, so the later request paid nothing')
      assert.equal(await balance(first.address), 40n * UNIT)
      assert.equal(await released(second.id), true)
      assert.equal(await released(first.id), false)
    })

    await t.test('application action reports payment only when funds moved', async () => {
      const app = createApplication({
        connect: async () => f.accounts[creator], disconnect: async () => {}, isAvailable: () => true,
        getAccount: async () => f.accounts[creator], getChainId: async () => 31337,
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
      }, { chainId: 31337, daoAddress: f.daoAddress, testUsdAddress: f.testUsdAddress, rpcUrl: 'http://127.0.0.1:8545' })
      await app.connect()

      const short = await proposalOn(30n * UNIT, 10n * UNIT)
      await mine(dao(voter).write.voteYes([short.id, 1n]))
      assert.equal((await app.releaseFunds(short.id)).status, 'funds-pending')
      assert.equal(await balance(short.address), 10n * UNIT)
      assert.deepEqual(await app.readFunding(short.id).then(r => r.status === 'success' ? r.funding : r), {
        proposalId: short.id, amount: 30n * UNIT, recipient: getAddress(f.accounts[creator]), state: 'passed-awaiting-funds',
      })

      const funded = await proposalOn(25n * UNIT, 100n * UNIT)
      await mine(dao(voter).write.voteYes([funded.id, 1n]))
      await closeVoting(funded.deadline)
      const before = await balance(f.accounts[creator])
      const paid = await app.releaseFunds(funded.id)
      assert.equal(paid.status, 'confirmed')
      assert.equal(await balance(f.accounts[creator]) - before, 25n * UNIT)
      assert.equal(await balance(funded.address), 75n * UNIT)
      assert.deepEqual(await app.readFunding(funded.id).then(r => r.status === 'success' ? r.funding : r), {
        proposalId: funded.id, amount: 25n * UNIT, recipient: getAddress(f.accounts[creator]), state: 'paid',
      })

      assert.equal((await app.releaseFunds(funded.id)).status, 'transaction-failed')
      assert.equal(await balance(funded.address), 75n * UNIT)
      assert.equal((await app.releaseFunds(0n)).status, 'invalid-input')

      const unpassed = await proposalOn(5n * UNIT, 100n * UNIT)
      assert.equal((await app.releaseFunds(unpassed.id)).status, 'transaction-failed')
      assert.deepEqual(await app.readFunding(unpassed.id).then(r => r.status === 'success' ? r.funding : r), {
        proposalId: unpassed.id, amount: 5n * UNIT, recipient: getAddress(f.accounts[creator]), state: 'not-passed',
      })
    })
  } finally { await connection.close() }
})
