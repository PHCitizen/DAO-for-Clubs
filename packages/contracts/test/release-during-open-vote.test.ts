import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { getContract, type Address, type Hex } from 'viem'
import { deployTestFixture } from './fixtures.js'

const UNIT = 10n ** 18n

test('a release request can record passing itself while voting is open', async (t) => {
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
    const released = (id: bigint) => dao(0).read.fundsReleased([id]) as Promise<boolean>
    const closeVoting = async (deadline: bigint) => {
      await connection.provider.request({ method: 'evm_setNextBlockTimestamp', params: [Number(deadline)] })
      await connection.provider.request({ method: 'evm_mine' })
    }

    /** A treasury with `supply` voting NFTs (all minted to `voter`), and an open proposal for `amount`/`funding` against it. */
    async function openProposal(supply: number, amount: bigint, funding: bigint) {
      await mine(dao(0).write.createTreasury())
      const address = (await dao(0).read.getTreasuries() as Address[]).at(-1)!
      const membership = getContract({ address, abi: f.treasuryArtifact.abi, client: { public: f.publicClient, wallet: f.walletClients[0] } })
      for (let i = 0; i < supply; i++) await mine(membership.write.mintVotingNft([f.accounts[voter]]))
      if (funding > 0n) await mine(asset.write.mint([address, funding]))
      const deadline = (await f.publicClient.getBlock()).timestamp + 3600n
      await mine(dao(creator).write.createProposal([address, amount, deadline, 'ipfs://document']))
      const id = await dao(0).read.proposalCount() as bigint
      return { address, membership, id, deadline }
    }

    await t.test('burn-qualified open proposal with no funds: one release tx records passing but pays nothing', async () => {
      // supply 6, threshold 4; cast only 3 yes votes (below threshold), then burn two credentials to drop the threshold to 3.
      const { address, membership, id, deadline } = await openProposal(6, 50n * UNIT, 0n)
      await mine(dao(voter).write.voteYes([id, 1n]))
      await mine(dao(voter).write.voteYes([id, 2n]))
      await mine(dao(voter).write.voteYes([id, 3n]))
      assert.deepEqual(await dao(0).read.getVoting([id]), [3n, 4n, false, true, 0n])
      await mine(membership.write.burnVotingNft([4n]))
      await mine(membership.write.burnVotingNft([5n]))
      assert.deepEqual(await dao(0).read.getVoting([id]), [3n, 3n, false, true, 0n])

      const receipt = await mine(dao(creator).write.releaseFunds([id]))
      assert.equal(receipt.status, 'success')
      // Passing is now recorded, persisted by the very transaction that found a shortage.
      assert.deepEqual(await dao(0).read.getVoting([id]), [3n, 3n, true, false, 0n])
      assert.equal(await released(id), false)
      assert.equal(await balance(address), 0n)
      const range = { fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber }
      assert.equal((await dao(0).getEvents.ProposalPassed({}, range)).length, 1)
      assert.equal((await dao(0).getEvents.FundingShortage({}, range)).length, 1)
      assert.equal((await dao(0).getEvents.FundsReleased({}, range)).length, 0)

      // Later, after replenishment and even after vote close, no new vote or passing check is needed to pay.
      await mine(asset.write.mint([address, 50n * UNIT]))
      await closeVoting(deadline)
      const before = await balance(f.accounts[creator])
      await mine(dao(creator).write.releaseFunds([id]))
      assert.equal(await balance(f.accounts[creator]) - before, 50n * UNIT)
      assert.equal(await released(id), true)
    })

    await t.test('burn-qualified open proposal with sufficient funds: one release tx both records passing and pays', async () => {
      const { address, membership, id } = await openProposal(6, 20n * UNIT, 20n * UNIT)
      await mine(dao(voter).write.voteYes([id, 1n]))
      await mine(dao(voter).write.voteYes([id, 2n]))
      await mine(dao(voter).write.voteYes([id, 3n]))
      await mine(membership.write.burnVotingNft([4n]))
      await mine(membership.write.burnVotingNft([5n]))
      assert.deepEqual(await dao(0).read.getVoting([id]), [3n, 3n, false, true, 0n])

      const before = await balance(f.accounts[creator])
      const receipt = await mine(dao(creator).write.releaseFunds([id]))
      assert.equal(receipt.status, 'success')
      assert.deepEqual(await dao(0).read.getVoting([id]), [3n, 3n, true, false, 0n])
      assert.equal(await balance(f.accounts[creator]) - before, 20n * UNIT)
      assert.equal(await balance(address), 0n)
      assert.equal(await released(id), true)

      await assert.rejects(dao(creator).write.releaseFunds([id]), /FundsAlreadyReleased/)
    })

    await t.test('rejects a release request by anyone but the creator, recording nothing', async () => {
      // supply 2, threshold 2: a single yes vote is open and not yet passed.
      const { id } = await openProposal(2, 10n * UNIT, 10n * UNIT)
      await mine(dao(voter).write.voteYes([id, 1n]))
      for (const caller of [stranger, voter, 0]) {
        await assert.rejects(dao(caller).write.releaseFunds([id]), /NotProposalCreator/)
      }
      assert.deepEqual(await dao(0).read.getVoting([id]), [1n, 2n, false, true, 0n])
      assert.equal(await released(id), false)
    })

    await t.test('rejects first recording passing through release at and after the deadline', async () => {
      // supply 6, threshold 4: a single yes vote never qualifies before the deadline closes it.
      const { id, deadline } = await openProposal(6, 10n * UNIT, 10n * UNIT)
      await mine(dao(voter).write.voteYes([id, 1n]))
      await closeVoting(deadline)
      assert.deepEqual(await dao(0).read.getVoting([id]), [1n, 4n, false, false, 0n])
      await assert.rejects(dao(creator).write.releaseFunds([id]), /ProposalNotPassed/)
      assert.deepEqual(await dao(0).read.getVoting([id]), [1n, 4n, false, false, 0n])
      assert.equal(await released(id), false)
    })

    await t.test('rejects a release request without enough yes votes under current supply', async () => {
      const { id } = await openProposal(6, 10n * UNIT, 10n * UNIT)
      await mine(dao(voter).write.voteYes([id, 1n]))
      await assert.rejects(dao(creator).write.releaseFunds([id]), /ProposalNotPassed/)
      assert.deepEqual(await dao(0).read.getVoting([id]), [1n, 4n, false, true, 0n])
      assert.equal(await released(id), false)
    })
  } finally { await connection.close() }
})
