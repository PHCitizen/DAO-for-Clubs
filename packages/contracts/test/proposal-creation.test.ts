import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { getContract, parseEventLogs, type Address, type WalletClient } from 'viem'
import { deployTestFixture } from './fixtures.js'

const DOCUMENT_REFERENCE =
  'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

test('proposal creation on a real local chain', async (t) => {
  const connection = await network.create('default')
  try {
    const {
      daoAddress,
      testUsdAddress,
      publicClient,
      walletClients,
      accounts,
      daoArtifact,
      treasuryArtifact,
    } = await deployTestFixture(connection.provider as any)

    function daoAs(wallet: WalletClient) {
      return getContract({
        address: daoAddress,
        abi: daoArtifact.abi,
        client: { public: publicClient, wallet },
      })
    }

    const daoReader = getContract({
      address: daoAddress,
      abi: daoArtifact.abi,
      client: { public: publicClient },
    })

    interface ProposalRecord {
      id: bigint
      treasury: Address
      creator: Address
      amount: bigint
      payoutRecipient: Address
      votingDeadline: bigint
      documentReference: string
    }

    async function readProposal(id: bigint): Promise<ProposalRecord> {
      return (await daoReader.read.getProposal([id])) as unknown as ProposalRecord
    }

    async function createTreasury(wallet: WalletClient): Promise<Address> {
      const before = (await daoReader.read.getTreasuries()) as Address[]
      const hash = await daoAs(wallet).write.createTreasury()
      await publicClient.waitForTransactionReceipt({ hash })
      const after = (await daoReader.read.getTreasuries()) as Address[]
      return after[before.length]!
    }

    const treasuryA = await createTreasury(walletClients[1]!)
    const treasuryB = await createTreasury(walletClients[2]!)
    const creator = accounts[3]!
    const otherCreator = accounts[4]!

    const deadline = (await publicClient.getBlock()).timestamp + 3600n

    await t.test('assigns global incrementing IDs across treasuries with fixed terms', async () => {
      assert.equal(await daoReader.read.proposalCount(), 0n)

      const hash = await daoAs(walletClients[3]!).write.createProposal([
        treasuryA,
        500n,
        deadline,
        DOCUMENT_REFERENCE,
      ])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      assert.equal(receipt.status, 'success')

      // The confirmed event reports the actual assigned ID.
      const events = parseEventLogs({
        abi: daoArtifact.abi,
        logs: receipt.logs,
        eventName: 'ProposalCreated',
      })
      assert.equal(events.length, 1)
      assert.equal((events[0]!.args as unknown as { id: bigint }).id, 1n)

      const proposal = await readProposal(1n)
      assert.equal(proposal.id, 1n)
      assert.equal(proposal.treasury.toLowerCase(), treasuryA.toLowerCase())
      assert.equal(proposal.creator.toLowerCase(), creator.toLowerCase())
      assert.equal(proposal.payoutRecipient.toLowerCase(), creator.toLowerCase())
      assert.equal(proposal.amount, 500n)
      assert.equal(proposal.votingDeadline, deadline)
      assert.equal(proposal.documentReference, DOCUMENT_REFERENCE)

      // A different creator against a different treasury continues the same
      // DAO-wide sequence rather than restarting per treasury.
      const secondHash = await daoAs(walletClients[4]!).write.createProposal([
        treasuryB,
        750n,
        deadline,
        'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzda',
      ])
      await publicClient.waitForTransactionReceipt({ hash: secondHash })
      const thirdHash = await daoAs(walletClients[3]!).write.createProposal([
        treasuryA,
        900n,
        deadline,
        DOCUMENT_REFERENCE,
      ])
      await publicClient.waitForTransactionReceipt({ hash: thirdHash })

      assert.equal(await daoReader.read.proposalCount(), 3n)
      const second = await readProposal(2n)
      assert.equal(second.treasury.toLowerCase(), treasuryB.toLowerCase())
      assert.equal(second.creator.toLowerCase(), otherCreator.toLowerCase())
      assert.equal(second.payoutRecipient.toLowerCase(), otherCreator.toLowerCase())
      const third = await readProposal(3n)
      assert.equal(third.treasury.toLowerCase(), treasuryA.toLowerCase())
      assert.equal(third.amount, 900n)
    })

    await t.test('allows anyone to propose with zero voting NFT supply', async () => {
      for (const treasury of [treasuryA, treasuryB]) {
        const pool = getContract({
          address: treasury,
          abi: treasuryArtifact.abi,
          client: { public: publicClient },
        })
        assert.equal(await pool.read.totalSupply(), 0n)
        assert.equal(await pool.read.balanceOf([creator]), 0n)
      }
      // Proposals 1-3 above were created by accounts holding no voting NFTs.
      assert.equal(await daoReader.read.proposalCount(), 3n)
    })

    await t.test('rejects malformed creation inputs without allocating a record', async () => {
      const unregistered = accounts[8]!
      await assert.rejects(
        () => daoAs(walletClients[3]!).write.createProposal([unregistered, 1n, deadline, DOCUMENT_REFERENCE]),
        (error: Error) => error.message.includes('TreasuryNotRegistered') || error.message.includes('revert')
      )
      await assert.rejects(
        () => daoAs(walletClients[3]!).write.createProposal([treasuryA, 0n, deadline, DOCUMENT_REFERENCE]),
        (error: Error) => error.message.includes('InvalidProposalAmount') || error.message.includes('revert')
      )
      await assert.rejects(
        () => daoAs(walletClients[3]!).write.createProposal([treasuryA, 1n, 0n, DOCUMENT_REFERENCE]),
        (error: Error) => error.message.includes('InvalidVotingDeadline') || error.message.includes('revert')
      )
      await assert.rejects(
        () => daoAs(walletClients[3]!).write.createProposal([treasuryA, 1n, deadline, '']),
        (error: Error) => error.message.includes('InvalidDocumentReference') || error.message.includes('revert')
      )
      // TestUSD is a contract but not a registered treasury.
      await assert.rejects(
        () => daoAs(walletClients[3]!).write.createProposal([testUsdAddress, 1n, deadline, DOCUMENT_REFERENCE]),
        (error: Error) => error.message.includes('TreasuryNotRegistered') || error.message.includes('revert')
      )

      assert.equal(await daoReader.read.proposalCount(), 3n)
    })

    await t.test('exposes immutable terms and rejects unknown proposal IDs', async () => {
      const before = await readProposal(1n)

      // No proposal terms can be edited. Voting mutates only the separate
      // result record, not the proposal's immutable terms.
      const mutating = daoArtifact.abi
        .filter(
          (entry) =>
            entry.type === 'function' &&
            entry.stateMutability !== 'view' &&
            entry.stateMutability !== 'pure'
        )
        .map((entry) => ('name' in entry ? entry.name : ''))
        .sort()
      assert.deepEqual(mutating, ['createProposal', 'createTreasury', 'voteYes'])

      const after = await readProposal(1n)
      assert.deepEqual(after, before)

      await assert.rejects(
        () => daoReader.read.getProposal([0n]),
        (error: Error) => error.message.includes('ProposalNotFound') || error.message.includes('revert')
      )
      await assert.rejects(
        () => daoReader.read.getProposal([999n]),
        (error: Error) => error.message.includes('ProposalNotFound') || error.message.includes('revert')
      )
    })
  } finally {
    await connection.close()
  }
})
