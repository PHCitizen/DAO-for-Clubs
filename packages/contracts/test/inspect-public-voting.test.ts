import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { encodeFunctionData, getAbiItem, getAddress, getContract, type Address, type Hex } from 'viem'
import { createApplication } from '../../frontend/src/application.ts'
import { deployTestFixture } from './fixtures.js'

test('public ballot inspection: wallet-free, event-derived, and separate from voting totals, funding, and attendance', async (t) => {
  const connection = await network.create('default')
  try {
    const f = await deployTestFixture(connection.provider as any)
    const VOTER = getAddress(f.accounts[3])
    const mine = async (hash: Promise<Hex>) => f.publicClient.waitForTransactionReceipt({ hash: await hash })
    const dao = (wallet = 1) => getContract({ address: f.daoAddress, abi: f.daoArtifact.abi,
      client: { public: f.publicClient, wallet: f.walletClients[wallet] } })
    const treasury = (address: Address) => getContract({ address, abi: f.treasuryArtifact.abi,
      client: { public: f.publicClient, wallet: f.walletClients[1] } })
    async function setup(supply: number) {
      await mine(dao().write.createTreasury())
      const addresses = await dao().read.getTreasuries() as Address[]
      const address = addresses.at(-1)!
      const membership = treasury(address)
      for (let i = 0; i < supply; i++) await mine(membership.write.mintVotingNft([f.accounts[3]]))
      const deadline = (await f.publicClient.getBlock()).timestamp + 3600n
      await mine(dao().write.createProposal([address, 1n, deadline, 'ipfs://document']))
      const id = await dao().read.proposalCount() as bigint
      return { address, membership, deadline, id }
    }

    // No wallet is ever connected for this app instance: public ballot
    // inspection and voting-progress reads must work wallet-free.
    const app = createApplication(undefined, {
      getChainId: () => f.publicClient.getChainId(),
      getBlockNumber: () => f.publicClient.getBlockNumber(),
      readContract: request => f.publicClient.readContract(request as any) as any,
      waitForTransactionReceipt: hash => f.publicClient.waitForTransactionReceipt({ hash }),
      getLogs: request => f.publicClient.getLogs({
        address: request.address,
        event: getAbiItem({ abi: request.abi as any, name: request.eventName }) as any,
        args: request.args,
        fromBlock: request.fromBlock ?? 0n,
        toBlock: request.toBlock ?? 'latest',
      } as any).then(logs => logs.map(log => ({ args: (log as any).args }))),
    }, { chainId: 31337, daoAddress: f.daoAddress, testUsdAddress: f.testUsdAddress, rpcUrl: 'http://127.0.0.1:8545' })

    // A separate wallet-bearing app submits the actual ballots/burns/mints,
    // exercising the contract paths that the read-only app above inspects.
    const actor = createApplication({
      connect: async () => f.accounts[1],
      disconnect: async () => {},
      isAvailable: () => true,
      getAccount: async () => f.accounts[1],
      getChainId: async () => 31337,
      onAccountChanged: () => () => {},
      onChainChanged: () => () => {},
      switchChain: async () => {},
      signMessage: async () => { throw new Error('signing is not used by voting') },
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
    await actor.connect()

    async function ballots(id: bigint) {
      const result = await app.readBallots(id)
      assert.equal(result.status, 'success', JSON.stringify(result, (_, value) => typeof value === 'bigint' ? String(value) : value))
      if (result.status !== 'success') throw new Error('unreachable')
      return result.ballots
    }
    async function progress(id: bigint) {
      const result = await app.readVoting(id)
      assert.equal(result.status, 'success')
      if (result.status !== 'success') throw new Error('unreachable')
      return result.progress
    }

    await t.test('both ballot choices appear with voter, tokenId, and choice', async () => {
      const { id, membership } = await setup(4)
      await mine(dao(3).write.voteYes([id, 1n]))
      await mine(dao(3).write.voteNo([id, 2n]))
      assert.deepEqual(await ballots(id), [
        { tokenId: 1n, voter: VOTER, choice: 'yes' },
        { tokenId: 2n, voter: VOTER, choice: 'no' },
      ])
      // Totals/threshold are reused from getVoting, not re-derived from logs.
      assert.deepEqual(await progress(id), { proposalId: id, yesVotes: 1n, noVotes: 1n, threshold: 3n, outcome: 'open' })
      // Burning raises or lowers the live threshold; the read reflects it immediately.
      await mine(membership.write.burnVotingNft([3n]))
      await mine(membership.write.burnVotingNft([4n]))
      assert.deepEqual(await progress(id), { proposalId: id, yesVotes: 1n, noVotes: 1n, threshold: 2n, outcome: 'open' })
      await mine(membership.write.mintVotingNft([f.accounts[3]]))
      await mine(membership.write.mintVotingNft([f.accounts[3]]))
      assert.deepEqual(await progress(id), { proposalId: id, yesVotes: 1n, noVotes: 1n, threshold: 3n, outcome: 'open' })
    })

    await t.test('retained historical ballots survive burning the token that cast them', async () => {
      const { id, membership } = await setup(4)
      await mine(dao(3).write.voteYes([id, 1n]))
      await mine(dao(3).write.voteNo([id, 2n]))
      await mine(membership.write.burnVotingNft([1n]))
      await mine(membership.write.burnVotingNft([2n]))
      // The owner query for tokens 1 and 2 would now revert, yet the public
      // ballot list must still show both historical ballots unchanged.
      assert.deepEqual(await ballots(id), [
        { tokenId: 1n, voter: VOTER, choice: 'yes' },
        { tokenId: 2n, voter: VOTER, choice: 'no' },
      ])
    })

    await t.test('exact deadline boundary distinguishes open from closed-without-passing', async () => {
      const { id, deadline } = await setup(4)
      await mine(dao(3).write.voteYes([id, 1n]))
      await connection.provider.request({ method: 'evm_setNextBlockTimestamp', params: [Number(deadline - 1n)] })
      await connection.provider.request({ method: 'evm_mine' })
      assert.equal((await progress(id)).outcome, 'open')
      await connection.provider.request({ method: 'evm_setNextBlockTimestamp', params: [Number(deadline)] })
      await connection.provider.request({ method: 'evm_mine' })
      // At/after the deadline with no recorded passing, the outcome is
      // closed-without-passing even though a threshold was never checked here.
      assert.equal((await progress(id)).outcome, 'closed-without-passing')
      // The ballot already cast remains visible after close.
      assert.deepEqual(await ballots(id), [{ tokenId: 1n, voter: VOTER, choice: 'yes' }])
    })

    await t.test('recorded passing is irreversible across later mint/burn, never fabricated from a transient tally', async () => {
      const { id, membership } = await setup(2)
      await mine(dao(3).write.voteYes([id, 1n]))
      await mine(dao(3).write.voteYes([id, 2n]))
      assert.equal((await progress(id)).outcome, 'passed')
      await mine(membership.write.mintVotingNft([f.accounts[4]]))
      await mine(membership.write.mintVotingNft([f.accounts[4]]))
      assert.equal((await progress(id)).outcome, 'passed')
      await mine(membership.write.burnVotingNft([1n]))
      await mine(membership.write.burnVotingNft([2n]))
      // Still passed after the originally-qualifying tokens are both burned.
      assert.equal((await progress(id)).outcome, 'passed')
      assert.deepEqual(await ballots(id), [
        { tokenId: 1n, voter: VOTER, choice: 'yes' },
        { tokenId: 2n, voter: VOTER, choice: 'yes' },
      ])

      // A proposal whose threshold was transiently met but never checked
      // before the deadline must read as closed-without-passing, not passed.
      const never = await setup(4)
      await mine(dao(3).write.voteYes([never.id, 1n]))
      await mine(never.membership.write.burnVotingNft([2n]))
      await mine(never.membership.write.burnVotingNft([3n]))
      await mine(never.membership.write.burnVotingNft([4n]))
      // Current supply 1, threshold 1: the retained yes vote would currently
      // qualify, but nothing has recorded it, and we let the deadline pass.
      const beforeClose = await progress(never.id)
      assert.equal(beforeClose.outcome, 'open')
      assert.ok(beforeClose.yesVotes >= beforeClose.threshold)
      await connection.provider.request({ method: 'evm_setNextBlockTimestamp', params: [Number(never.deadline)] })
      await connection.provider.request({ method: 'evm_mine' })
      assert.equal((await progress(never.id)).outcome, 'closed-without-passing')
    })

    await t.test('the public ballot read is structurally separate from funding and attendance reads', async () => {
      const { id } = await setup(2)
      await mine(dao(3).write.voteYes([id, 1n]))
      const result = await app.readBallots(id)
      assert.equal(result.status, 'success')
      if (result.status !== 'success') throw new Error('unreachable')
      // Only identity/choice fields: no balance, payout, or attendance keys.
      assert.deepEqual(Object.keys(result).sort(), ['ballots', 'chainId', 'status'])
      for (const ballot of result.ballots) {
        assert.deepEqual(Object.keys(ballot).sort(), ['choice', 'tokenId', 'voter'])
      }
      const votingResult = await app.readVoting(id)
      assert.equal(votingResult.status, 'success')
      if (votingResult.status !== 'success') throw new Error('unreachable')
      assert.deepEqual(Object.keys(votingResult.progress).sort(), ['noVotes', 'outcome', 'proposalId', 'threshold', 'yesVotes'])
    })
  } finally { await connection.close() }
})
