import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { encodeFunctionData, getContract, type Address, type Hex } from 'viem'
import { createApplication } from '../../frontend/src/application.ts'
import { deployTestFixture } from './fixtures.js'

test('explicit passing check records passing after burns without a new ballot', async (t) => {
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

    // A third, unrelated account (index 2) submits the application's passing
    // check throughout: anyone can trigger it, not just voters or administrators.
    const app = createApplication({
      connect: async () => f.accounts[2],
      disconnect: async () => {},
      isAvailable: () => true,
      getAccount: async () => f.accounts[2],
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

    await t.test('six NFTs, three yes votes, two burns: explicit check records passing without a fourth vote', async () => {
      const { id, address, membership } = await setup(6)
      // threshold at supply 6 is 4; cast only 3 yes votes, below threshold
      await mine(dao(3).write.voteYes([id, 1n]))
      await mine(dao(3).write.voteYes([id, 2n]))
      await mine(dao(3).write.voteYes([id, 3n]))
      assert.deepEqual(await dao().read.getVoting([id]), [3n, 4n, false, true])
      // burn two credentials, dropping current supply to 4; threshold becomes 3
      await mine(membership.write.burnVotingNft([4n]))
      await mine(membership.write.burnVotingNft([5n]))
      assert.deepEqual(await dao().read.getVoting([id]), [3n, 3n, false, true])
      // explicit permissionless check, through the application action, records
      // passing without a fourth vote, submitted by an unrelated wallet
      const result = await app.checkPassing(id)
      assert.equal(result.status, 'confirmed', JSON.stringify(result, (_, value) => typeof value === 'bigint' ? String(value) : value))
      if (result.status !== 'confirmed') throw new Error('unreachable')
      assert.deepEqual(result.progress, { proposalId: id, yesVotes: 3n, threshold: 3n, outcome: 'passed' })
      assert.deepEqual(await dao().read.getVoting([id]), [3n, 3n, true, false])
      // feedback is a vote-passing determination, not a payout: no treasury balance is touched
      const asset = getContract({ address: f.testUsdAddress, abi: f.testUsdArtifact.abi, client: f.publicClient })
      assert.equal(await asset.read.balanceOf([address]), 0n)
    })

    await t.test('application action rejects insufficient yes votes and closed voting without submitting a passing record', async () => {
      const { id } = await setup(6)
      await mine(dao(3).write.voteYes([id, 1n]))
      const insufficient = await app.checkPassing(id)
      assert.equal(insufficient.status, 'transaction-failed')
      assert.deepEqual(await dao().read.getVoting([id]), [1n, 4n, false, true])

      const closed = await setup(2)
      await mine(dao(3).write.voteYes([closed.id, 1n]))
      await mine(dao(3).write.voteYes([closed.id, 2n]))
      const afterPass = await app.checkPassing(closed.id)
      assert.equal(afterPass.status, 'transaction-failed')
    })

    await t.test('insufficient yes votes under current supply reverts and records nothing', async () => {
      const { id, membership } = await setup(6)
      await mine(dao(3).write.voteYes([id, 1n]))
      await mine(dao(3).write.voteYes([id, 2n]))
      // threshold stays 4 at supply 6; two yes votes cannot qualify
      await assert.rejects(dao(2).write.checkPassing([id]), /InsufficientYesVotes/)
      assert.deepEqual(await dao().read.getVoting([id]), [2n, 4n, false, true])
      // minting raises the threshold further before any check can succeed
      await mine(membership.write.mintVotingNft([f.accounts[3]]))
      assert.deepEqual(await dao().read.getVoting([id]), [2n, 4n, false, true])
      await assert.rejects(dao(2).write.checkPassing([id]), /InsufficientYesVotes/)
    })

    await t.test('voting must be open: rejects after recorded passing and at/after the deadline', async () => {
      const already = await setup(2)
      await mine(dao(3).write.voteYes([already.id, 1n]))
      await mine(dao(3).write.voteYes([already.id, 2n]))
      assert.deepEqual(await dao().read.getVoting([already.id]), [2n, 2n, true, false])
      await assert.rejects(dao(2).write.checkPassing([already.id]), /VotingClosed/)

      const boundary = await setup(2)
      await mine(dao(3).write.voteYes([boundary.id, 1n]))
      // threshold 2 with one yes vote: insufficient while still open
      await assert.rejects(dao(2).write.checkPassing([boundary.id]), /InsufficientYesVotes/)
      await mine(boundary.membership.write.burnVotingNft([2n]))
      // current supply now 1; threshold 1; the retained yes vote would qualify
      await connection.provider.request({ method: 'evm_setNextBlockTimestamp', params: [Number(boundary.deadline - 1n)] })
      await connection.provider.request({ method: 'evm_mine' })
      assert.deepEqual(await dao().read.getVoting([boundary.id]), [1n, 1n, false, true])
      await connection.provider.request({ method: 'evm_setNextBlockTimestamp', params: [Number(boundary.deadline)] })
      await connection.provider.request({ method: 'evm_mine' })
      // at the exact deadline the vote is closed even though the threshold was met earlier
      assert.deepEqual(await dao().read.getVoting([boundary.id]), [1n, 1n, false, false])
      await assert.rejects(dao(2).write.checkPassing([boundary.id]), /VotingClosed/)
      assert.deepEqual(await dao().read.getVoting([boundary.id]), [1n, 1n, false, false])
    })

    await t.test('recorded passing is irreversible across later minting and burning', async () => {
      const { id, membership } = await setup(4)
      await mine(dao(3).write.voteYes([id, 1n]))
      await mine(dao(3).write.voteYes([id, 2n]))
      await mine(membership.write.burnVotingNft([3n]))
      await mine(membership.write.burnVotingNft([4n]))
      await mine(dao(2).write.checkPassing([id]))
      assert.deepEqual(await dao().read.getVoting([id]), [2n, 2n, true, false])
      await mine(membership.write.mintVotingNft([f.accounts[4]]))
      await mine(membership.write.mintVotingNft([f.accounts[4]]))
      await mine(membership.write.burnVotingNft([1n]))
      assert.deepEqual(await dao().read.getVoting([id]), [2n, 2n, true, false])
      await assert.rejects(dao(2).write.checkPassing([id]), /VotingClosed/)
    })

    await t.test('current supply zero: retained yes votes can still qualify, but a never-voted proposal cannot', async () => {
      // supply 2 keeps the one yes vote below threshold at cast time, so burning
      // both credentials down to zero supply exercises an explicit check rather
      // than an automatic pass inside voteYes itself.
      const withVote = await setup(2)
      await mine(dao(3).write.voteYes([withVote.id, 1n]))
      assert.deepEqual(await dao().read.getVoting([withVote.id]), [1n, 2n, false, true])
      await mine(withVote.membership.write.burnVotingNft([1n]))
      await mine(withVote.membership.write.burnVotingNft([2n]))
      assert.deepEqual(await dao().read.getVoting([withVote.id]), [1n, 1n, false, true])
      await mine(dao(2).write.checkPassing([withVote.id]))
      assert.deepEqual(await dao().read.getVoting([withVote.id]), [1n, 1n, true, false])

      const withoutVote = await setup(0)
      assert.deepEqual(await dao().read.getVoting([withoutVote.id]), [0n, 1n, false, true])
      await assert.rejects(dao(2).write.checkPassing([withoutVote.id]), /InsufficientYesVotes/)
    })
  } finally { await connection.close() }
})
