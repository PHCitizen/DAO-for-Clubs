import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import {
  encodeFunctionData,
  getAddress,
  getContract,
  type Address,
  type EIP1193Provider,
  type Hex,
  type PublicClient,
} from 'viem'
import {
  createProposalOnChain,
  readProposalCount,
  readProposalTerms,
  ProposalRevertedError,
  ProposalSubmissionError,
  type ProposalChain,
  type ProposalReadRequest,
  type ProposalTransactionReceipt,
} from '../../frontend/src/proposalCreation.ts'
import { deployTestFixture } from './fixtures.js'

const DOCUMENT_REFERENCE =
  'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

function makeChain(provider: EIP1193Provider, publicClient: PublicClient): ProposalChain {
  return {
    getChainId: () => publicClient.getChainId(),
    readContract: <T = unknown>(request: ProposalReadRequest): Promise<T> =>
      publicClient.readContract(request as any) as Promise<T>,
    sendTransaction: async (request) => {
      const data = encodeFunctionData({
        abi: request.abi,
        functionName: request.functionName,
        args: request.args,
      })
      return (await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: request.from, to: request.address, data }],
      })) as Hex
    },
    waitForTransactionReceipt: async (hash: Hex): Promise<ProposalTransactionReceipt> => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      return {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        logs: receipt.logs.map((log) => ({
          address: log.address,
          data: log.data,
          topics: log.topics,
        })),
      }
    },
  }
}

test('proposal creation through the application module on a real local chain', async (t) => {
  const connection = await network.create('default')
  try {
    const {
      daoAddress,
      testUsdAddress,
      publicClient,
      walletClients,
      accounts,
      daoArtifact,
      testUsdArtifact,
      treasuryArtifact,
    } = await deployTestFixture(connection.provider as any)

    const chain = makeChain(connection.provider as EIP1193Provider, publicClient)
    const config = {
      chainId: 31337,
      daoAddress,
      testUsdAddress,
      daoAbi: daoArtifact.abi,
      testUsdAbi: testUsdArtifact.abi,
    }

    const dao = getContract({
      address: daoAddress,
      abi: daoArtifact.abi,
      client: { public: publicClient },
    })

    async function createTreasury(index: number): Promise<Address> {
      const writer = getContract({
        address: daoAddress,
        abi: daoArtifact.abi,
        client: { public: publicClient, wallet: walletClients[index]! },
      })
      const before = (await dao.read.getTreasuries()) as Address[]
      const hash = await writer.write.createTreasury()
      await publicClient.waitForTransactionReceipt({ hash })
      const after = (await dao.read.getTreasuries()) as Address[]
      return after[before.length]!
    }

    const treasuryA = await createTreasury(1)
    const treasuryB = await createTreasury(2)
    const creator = accounts[3]!
    const deadline = Number((await publicClient.getBlock()).timestamp + 3600n)

    await t.test('creates globally numbered proposals with confirmed terms', async () => {
      const first = await createProposalOnChain(chain, config, {
        from: creator,
        treasury: treasuryA,
        amount: '12.5',
        votingDeadline: deadline,
        documentReference: DOCUMENT_REFERENCE,
      })

      assert.equal(first.status, 'success')
      if (first.status !== 'success') return
      assert.equal(first.proposal.id, 1n)
      assert.equal(first.proposal.treasury, getAddress(treasuryA))
      assert.equal(first.proposal.creator, getAddress(creator))
      assert.equal(first.proposal.payoutRecipient, getAddress(creator))
      assert.equal(first.proposal.amount, 12_500_000_000_000_000_000n)
      assert.equal(first.proposal.votingDeadline, BigInt(deadline))
      assert.equal(first.proposal.documentReference, DOCUMENT_REFERENCE)
      assert.equal(first.formattedAmount, '12.5')
      assert.equal(first.symbol, 'TUSD')

      const receipt = await publicClient.waitForTransactionReceipt({ hash: first.hash })
      assert.equal(receipt.status, 'success')
      assert.equal(first.blockNumber, receipt.blockNumber)

      const readBack = await readProposalTerms(chain, config, 1n)
      assert.deepEqual(readBack, first.proposal)
      assert.equal(await readProposalCount(chain, config), 1n)

      const second = await createProposalOnChain(chain, config, {
        from: accounts[4]!,
        treasury: treasuryB,
        amount: '0.000000000000000001',
        votingDeadline: deadline,
        documentReference: DOCUMENT_REFERENCE,
      })
      assert.equal(second.status, 'success')
      if (second.status === 'success') {
        assert.equal(second.proposal.id, 2n)
        assert.equal(second.proposal.treasury, getAddress(treasuryB))
        assert.equal(second.proposal.amount, 1n)
        assert.equal(second.formattedAmount, '0.000000000000000001')
      }
      assert.equal(await readProposalCount(chain, config), 2n)
      assert.equal(await readProposalTerms(chain, config, 99n), null)
    })

    await t.test('creates proposals while voting NFT supply is zero', async () => {
      const treasury = getContract({
        address: treasuryA,
        abi: treasuryArtifact.abi,
        client: { public: publicClient },
      })
      assert.equal(await treasury.read.totalSupply(), 0n)
      assert.equal(await treasury.read.balanceOf([creator]), 0n)
      assert.equal(await readProposalCount(chain, config), 2n)
    })

    await t.test('rejects invalid inputs without submitting a transaction', async () => {
      const cases: Array<[Parameters<typeof createProposalOnChain>[2], string]> = [
        [
          {
            from: creator,
            treasury: accounts[8]!,
            amount: '1',
            votingDeadline: deadline,
            documentReference: DOCUMENT_REFERENCE,
          },
          'unregistered-treasury',
        ],
        [
          {
            from: creator,
            treasury: 'not-an-address',
            amount: '1',
            votingDeadline: deadline,
            documentReference: DOCUMENT_REFERENCE,
          },
          'invalid-treasury',
        ],
        [
          {
            from: creator,
            treasury: treasuryA,
            amount: '0',
            votingDeadline: deadline,
            documentReference: DOCUMENT_REFERENCE,
          },
          'invalid-amount',
        ],
        [
          {
            from: creator,
            treasury: treasuryA,
            amount: '1',
            votingDeadline: 1,
            documentReference: DOCUMENT_REFERENCE,
          },
          'invalid-deadline',
        ],
        [
          {
            from: creator,
            treasury: treasuryA,
            amount: '1',
            votingDeadline: deadline,
            documentReference: 'https://example.com/doc.json',
          },
          'invalid-reference',
        ],
      ]

      for (const [input, expected] of cases) {
        const outcome = await createProposalOnChain(chain, config, input)
        assert.equal(outcome.status, expected)
      }
      assert.equal(await readProposalCount(chain, config), 2n)
    })

    await t.test('a rejected creation can be retried without inventing a proposal', async () => {
      // A stale registry read lets an unregistered treasury reach the chain,
      // where creation must fail. Hardhat's local EVM reports that failure at
      // submission time; either way it must not look like a created proposal.
      const staleChain: ProposalChain = {
        ...chain,
        readContract: async <T = unknown>(request: ProposalReadRequest): Promise<T> => {
          if (request.functionName === 'isTreasury') return true as unknown as T
          return chain.readContract<T>(request)
        },
      }

      await assert.rejects(
        () =>
          createProposalOnChain(staleChain, config, {
            from: creator,
            treasury: accounts[8]!,
            amount: '1',
            votingDeadline: deadline,
            documentReference: DOCUMENT_REFERENCE,
          }),
        (error: unknown) =>
          error instanceof ProposalSubmissionError || error instanceof ProposalRevertedError
      )
      assert.equal(await readProposalCount(chain, config), 2n)

      const retried = await createProposalOnChain(chain, config, {
        from: creator,
        treasury: treasuryA,
        amount: '1',
        votingDeadline: deadline,
        documentReference: DOCUMENT_REFERENCE,
      })
      assert.equal(retried.status, 'success')
      if (retried.status === 'success') assert.equal(retried.proposal.id, 3n)
      assert.equal(await readProposalCount(chain, config), 3n)
    })
  } finally {
    await connection.close()
  }
})
