import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { encodeFunctionData, getContract, type Address, type Hex } from 'viem'
import { createApplication } from '../../frontend/src/application.ts'
import { deployTestFixture } from './fixtures.js'

test('yes ballots and recorded passing through real contracts and application actions', async (t) => {
  const connection = await network.create('default')
  try {
    const f = await deployTestFixture(connection.provider as any)
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
    const app = createApplication({
      connect: async () => f.accounts[3],
      disconnect: async () => {},
      isAvailable: () => true,
      getAccount: async () => f.accounts[3],
      getChainId: async () => 31337,
      onAccountChanged: () => () => {},
      onChainChanged: () => () => {},
      switchChain: async () => {},
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
    async function progress(id: bigint) {
      const result = await app.readVoting(id)
      assert.equal(result.status, 'success')
      if (result.status !== 'success') throw new Error('Voting read failed')
      return result.progress
    }
    async function vote(id: bigint, token: bigint) {
      const result = await app.voteYes(id, token)
      assert.equal(result.status, 'confirmed', JSON.stringify(result, (_, value) => typeof value === 'bigint' ? String(value) : value))
      return result
    }

    await t.test('odd/even live thresholds, separate NFTs, duplicate guard, empty treasury and irreversible early passing', async () => {
      for (const supply of [3, 4]) {
        const { id, address, membership } = await setup(supply)
        const threshold = BigInt(Math.floor(supply / 2) + 1)
        const immutableTerms = await dao().read.getProposal([id])
        assert.equal((await progress(id)).threshold, threshold)
        await vote(id, 1n)
        await assert.rejects(dao(3).write.voteYes([id, 1n]), /BallotAlreadyCast/)
        for (let token = 2n; token <= threshold; token++) await vote(id, token)
        assert.deepEqual(await progress(id), { proposalId: id, yesVotes: threshold, noVotes: 0n, threshold, outcome: 'passed' })
        assert.deepEqual(await dao().read.getProposal([id]), immutableTerms)
        const asset = getContract({ address: f.testUsdAddress, abi: f.testUsdArtifact.abi, client: f.publicClient })
        assert.equal(await asset.read.balanceOf([address]), 0n)
        await assert.rejects(dao(3).write.voteYes([id, BigInt(supply)]), /VotingClosed/)
        await mine(membership.write.mintVotingNft([f.accounts[3]]))
        await mine(membership.write.burnVotingNft([1n]))
        assert.equal((await progress(id)).outcome, 'passed')
      }
    })

    await t.test('zero starting supply and newly minted credentials on existing proposals', async () => {
      const { id, membership } = await setup(0)
      assert.equal((await progress(id)).threshold, 1n)
      await assert.rejects(dao(3).write.voteYes([id, 1n]), /NonexistentVotingNft/)
      await mine(membership.write.mintVotingNft([f.accounts[3]]))
      await vote(id, 1n)
      assert.equal((await progress(id)).outcome, 'passed')
      const next = await setup(2)
      await vote(next.id, 1n)
      await mine(next.membership.write.mintVotingNft([f.accounts[3]]))
      await mine(next.membership.write.mintVotingNft([f.accounts[3]]))
      assert.equal((await progress(next.id)).threshold, 3n)
      await vote(next.id, 3n)
      assert.equal((await progress(next.id)).outcome, 'open')
      await vote(next.id, 4n)
      assert.equal((await progress(next.id)).outcome, 'passed')
    })

    await t.test('credentials are scoped to proposal treasury and consumption is per proposal', async () => {
      const a = await setup(4)
      const b = await setup(1)
      await mine(b.membership.write.mintVotingNft([f.accounts[4]]))
      await assert.rejects(dao(4).write.voteYes([a.id, 2n]), /NotVotingNftHolder/)
      await assert.rejects(dao(2).write.voteYes([a.id, 1n]), /NotVotingNftHolder/)
      await assert.rejects(dao(3).write.voteYes([b.id, 3n]), /NonexistentVotingNft/)
      await mine(a.membership.write.burnVotingNft([4n]))
      await assert.rejects(dao(3).write.voteYes([a.id, 4n]), /NonexistentVotingNft/)
      await vote(a.id, 1n)
      await mine(dao().write.createProposal([a.address, 1n, a.deadline, 'ipfs://another']))
      const other = await dao().read.proposalCount() as bigint
      await vote(other, 1n)
      assert.equal(await dao().read.ballotConsumed([a.id, 1n]), true)
      assert.equal(await dao().read.ballotConsumed([other, 1n]), true)
      await mine(a.membership.write.burnVotingNft([1n]))
      assert.equal((await progress(a.id)).yesVotes, 1n)
      await mine(a.membership.write.burnVotingNft([2n]))
      await mine(a.membership.write.burnVotingNft([3n]))
      // Reads never infer a recorded pass, even when retained votes meet the
      // live threshold after every credential is burned.
      assert.deepEqual(await progress(a.id), { proposalId: a.id, yesVotes: 1n, noVotes: 0n, threshold: 1n, outcome: 'open' })
    })

    await t.test('no ballots consume credentials across choices without approving by participation', async () => {
      const unanimousNo = await setup(1)
      assert.equal((await app.voteNo(unanimousNo.id, 1n)).status, 'confirmed')
      assert.deepEqual(await progress(unanimousNo.id), { proposalId: unanimousNo.id, yesVotes: 0n, noVotes: 1n, threshold: 1n, outcome: 'open' })
      const a = await setup(6)
      const result = await app.voteNo(a.id, 1n)
      assert.equal(result.status, 'confirmed')
      assert.deepEqual(await progress(a.id), { proposalId: a.id, yesVotes: 0n, noVotes: 1n, threshold: 4n, outcome: 'open' })
      await assert.rejects(dao(3).write.voteNo([a.id, 1n]), /BallotAlreadyCast/)
      await assert.rejects(dao(3).write.voteYes([a.id, 1n]), /BallotAlreadyCast/)
      await assert.rejects(dao(4).write.voteNo([a.id, 1n]), /BallotAlreadyCast/)
      await vote(a.id, 2n)
      await assert.rejects(dao(3).write.voteNo([a.id, 2n]), /BallotAlreadyCast/)
      assert.equal((await app.voteNo(a.id, 3n)).status, 'confirmed')
      assert.equal((await progress(a.id)).outcome, 'open')
      await mine(dao().write.createProposal([a.address, 1n, a.deadline, 'ipfs://other']))
      const other = await dao().read.proposalCount() as bigint
      assert.equal((await app.voteNo(other, 1n)).status, 'confirmed')
      const b = await setup(0)
      await mine(b.membership.write.mintVotingNft([f.accounts[4]]))
      await assert.rejects(dao(4).write.voteNo([a.id, 4n]), /NotVotingNftHolder/)
      await assert.rejects(dao(3).write.voteNo([b.id, 1n]), /NotVotingNftHolder/)
      assert.equal((await app.voteNo(b.id, 1n)).status, 'transaction-failed')
      assert.equal((await progress(b.id)).noVotes, 0n)
      await mine(a.membership.write.burnVotingNft([6n]))
      await assert.rejects(dao(3).write.voteNo([a.id, 6n]), /NonexistentVotingNft/)
      assert.equal((await progress(a.id)).noVotes, 2n)
      assert.equal(await dao().read.ballotConsumed([a.id, 4n]), false)
    })

    await t.test('a no vote records existing qualifying yes votes after burns and closes voting', async () => {
      const { id, membership } = await setup(6)
      for (const token of [1n, 2n, 3n]) await vote(id, token)
      await mine(membership.write.burnVotingNft([5n]))
      await mine(membership.write.burnVotingNft([6n]))
      assert.equal((await progress(id)).outcome, 'open')
      assert.equal((await app.voteNo(id, 4n)).status, 'confirmed')
      assert.deepEqual(await progress(id), { proposalId: id, yesVotes: 3n, noVotes: 1n, threshold: 3n, outcome: 'passed' })
      await assert.rejects(dao(3).write.voteNo([id, 1n]), /VotingClosed/)
      assert.equal((await app.voteNo(id, 1n)).status, 'transaction-failed')
      assert.equal((await progress(id)).noVotes, 1n)
    })

    await t.test('no votes reject exactly at deadline and after a yes-triggered early close', async () => {
      const early = await setup(1)
      await vote(early.id, 1n)
      await assert.rejects(dao(3).write.voteNo([early.id, 1n]), /VotingClosed/)
      const { id, deadline } = await setup(3)
      await connection.provider.request({ method: 'evm_setNextBlockTimestamp', params: [Number(deadline - 1n)] })
      assert.equal((await app.voteNo(id, 1n)).status, 'confirmed')
      await connection.provider.request({ method: 'evm_setNextBlockTimestamp', params: [Number(deadline)] })
      await connection.provider.request({ method: 'evm_mine' })
      await assert.rejects(dao(3).write.voteNo([id, 2n]), /VotingClosed/)
      assert.equal((await app.voteNo(id, 2n)).status, 'transaction-failed')
      assert.deepEqual(await progress(id), { proposalId: id, yesVotes: 0n, noVotes: 1n, threshold: 2n, outcome: 'closed-without-passing' })
      assert.equal(await dao().read.ballotConsumed([id, 2n]), false)
    })

    await t.test('exact chain deadline closes voting, including a would-be passing ballot', async () => {
      const { id, deadline } = await setup(2)
      await connection.provider.request({ method: 'evm_setNextBlockTimestamp', params: [Number(deadline - 1n)] })
      await vote(id, 1n)
      await connection.provider.request({ method: 'evm_setNextBlockTimestamp', params: [Number(deadline)] })
      await connection.provider.request({ method: 'evm_mine' })
      assert.equal((await progress(id)).outcome, 'closed-without-passing')
      await assert.rejects(dao(3).write.voteYes([id, 2n]), /VotingClosed/)
      const failed = await app.voteYes(id, 2n)
      assert.equal(failed.status, 'transaction-failed')
      assert.equal((await progress(id)).yesVotes, 1n)
      assert.equal(await dao().read.ballotConsumed([id, 2n]), false)
      await assert.rejects(dao(3).write.voteYes([999n, 1n]), /ProposalNotFound/)
      assert.equal((await app.readVoting(999n)).status, 'not-found')
    })
  } finally { await connection.close() }
})
