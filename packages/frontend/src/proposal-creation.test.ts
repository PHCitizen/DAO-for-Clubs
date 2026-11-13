import { expect, test, vi } from 'vitest'
import { encodeAbiParameters, encodeEventTopics, getAddress, type Address, type Hex } from 'viem'
import { createApplication } from './application'
import type { RpcAdapter } from './rpc'
import type { WalletAdapter } from './wallet'
import { TransactionRejectedError } from './wallet'
import publicArtifacts from './generated/public-artifacts.json' with { type: 'json' }

const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
const DAO = '0x00000000000000000000000000000000000000d1' as Address
const TEST_USD = '0x0000000000000000000000000000000000000075' as Address
const TREASURY_A = '0x00000000000000000000000000000000000000a1' as Address
const TREASURY_B = '0x00000000000000000000000000000000000000b2' as Address
const CREATOR = '0x00000000000000000000000000000000000000c3' as Address
const HASH = `0x${'cd'.repeat(32)}` as Hex
const DEADLINE = Math.floor(Date.now() / 1000) + 3600
const DAO_ABI = publicArtifacts.abis.DAO

interface ProposalRecord {
  id: bigint
  treasury: Address
  creator: Address
  amount: bigint
  payoutRecipient: Address
  votingDeadline: bigint
  documentReference: string
}

type ChainOutcome = 'success' | 'reject' | 'revert' | 'confirmation-error'

function makeWallet(account: Address, send: (request: { args?: readonly unknown[] }) => Promise<Hex>) {
  return {
    isAvailable: () => true,
    connect: vi.fn(async () => account),
    disconnect: vi.fn(async () => {}),
    getAccount: vi.fn(async () => account),
    getChainId: vi.fn(async () => 31337),
    onAccountChanged: () => () => {},
    onChainChanged: () => () => {},
    switchChain: vi.fn(async () => {}),
    sendTransaction: vi.fn(send),
  } as unknown as WalletAdapter
}

function makeApp(outcome: ChainOutcome = 'success') {
  const state = {
    outcome,
    proposals: new Map<bigint, ProposalRecord>(),
    sent: [] as Array<{ functionName: string; args: readonly unknown[] }>,
  }

  const wallet = makeWallet(CREATOR, async (request) => {
    if (state.outcome === 'reject') throw new TransactionRejectedError()
    state.sent.push({ functionName: 'createProposal', args: request.args ?? [] })
    return HASH
  })

  const rpc = {
    getChainId: vi.fn(async () => 31337),
    getBlockNumber: vi.fn(async () => 1n),
    readContract: vi.fn(async (request: { functionName: string; args?: readonly unknown[] }) => {
      switch (request.functionName) {
        case 'attendanceVersion':
          return 2
        case 'isTreasury': {
          const address = (request.args![0] as string).toLowerCase()
          return address === TREASURY_A.toLowerCase() || address === TREASURY_B.toLowerCase()
        }
        case 'decimals':
          return 18
        case 'symbol':
          return 'TUSD'
        case 'proposalCount':
          return BigInt(state.proposals.size)
        case 'getProposal': {
          const id = request.args![0] as bigint
          const proposal = state.proposals.get(id)
          if (!proposal) throw new Error('ProposalNotFound')
          return proposal
        }
        default:
          throw new Error(`Unexpected read: ${request.functionName}`)
      }
    }),
    waitForTransactionReceipt: vi.fn(async () => {
      if (state.outcome === 'confirmation-error') throw new Error('receipt unavailable')
      if (state.outcome === 'revert') return { status: 'reverted', blockNumber: 5n, logs: [] }

      const last = state.sent[state.sent.length - 1]!
      const [treasury, amount, deadline, reference] = last.args as [
        Address,
        bigint,
        bigint,
        string,
      ]
      const id = BigInt(state.proposals.size + 1)
      const record: ProposalRecord = {
        id,
        treasury: getAddress(treasury),
        creator: getAddress(CREATOR),
        amount,
        payoutRecipient: getAddress(CREATOR),
        votingDeadline: deadline,
        documentReference: reference,
      }
      state.proposals.set(id, record)

      const topics = encodeEventTopics({
        abi: DAO_ABI,
        eventName: 'ProposalCreated',
        args: { id, treasury: record.treasury, creator: record.creator },
      })
      const data = encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'address' }, { type: 'uint256' }, { type: 'string' }],
        [amount, record.payoutRecipient, deadline, reference]
      )
      return {
        status: 'success',
        blockNumber: 5n,
        logs: [{ address: DAO, data, topics }],
      }
    }),
  } as unknown as RpcAdapter

  const app = createApplication(wallet, rpc, {
    chainId: 31337,
    daoAddress: DAO,
    testUsdAddress: TEST_USD,
  }, {
    ipfs: {
      pin: vi.fn(async () => ({ cid: CID })),
      retrieve: vi.fn(async () => new Uint8Array()),
    },
  })

  return { app, state, wallet }
}

async function pinDraft(app: ReturnType<typeof makeApp>['app']) {
  app.updateProposalDraft({ title: 'Club day', markdown: '# Agenda\n\nLunch.' })
  const pinned = await app.pinProposalDraft({ token: 'proposer-jwt' })
  expect(pinned.status).toBe('pinned')
}

// ---------------------------------------------------------------------------
// Prepared reference requirements
// ---------------------------------------------------------------------------

test('creation requires a pinned document matching the current draft', async () => {
  const { app, wallet } = makeApp()
  await app.connect()

  const unpinned = await app.createProposal({
    treasury: TREASURY_A,
    amount: '1',
    votingDeadline: DEADLINE,
  })
  expect(unpinned.status).toBe('not-pinned')

  await pinDraft(app)
  app.updateProposalDraft({ markdown: '# Edited after pinning' })

  const stale = await app.createProposal({
    treasury: TREASURY_A,
    amount: '1',
    votingDeadline: DEADLINE,
  })
  expect(stale.status).toBe('stale-reference')
  expect(wallet.sendTransaction).not.toHaveBeenCalled()
})

// ---------------------------------------------------------------------------
// Confirmed creation
// ---------------------------------------------------------------------------

test('confirmed creation reports the assigned global ID and immutable terms', async () => {
  const { app, state, wallet } = makeApp()
  await app.connect()
  await pinDraft(app)

  const result = await app.createProposal({
    treasury: TREASURY_A,
    amount: '12.5',
    votingDeadline: DEADLINE,
  })

  expect(result.status).toBe('created')
  if (result.status !== 'created') return
  expect(result.hash).toBe(HASH)
  expect(result.proposal.id).toBe(1n)
  expect(result.proposal.treasury).toBe(getAddress(TREASURY_A))
  expect(result.proposal.creator).toBe(getAddress(CREATOR))
  expect(result.proposal.payoutRecipient).toBe(getAddress(CREATOR))
  expect(result.proposal.amount).toBe(12_500_000_000_000_000_000n)
  expect(result.proposal.votingDeadline).toBe(BigInt(DEADLINE))
  expect(result.proposal.documentReference).toBe(`ipfs://${CID}`)
  expect(result.formattedAmount).toBe('12.5')
  expect(result.symbol).toBe('TUSD')

  expect(wallet.sendTransaction).toHaveBeenCalledWith(
    expect.objectContaining({
      from: getAddress(CREATOR),
      to: DAO,
      functionName: 'createProposalV2',
      args: [getAddress(TREASURY_A), 12_500_000_000_000_000_000n, BigInt(DEADLINE), `ipfs://${CID}`],
    })
  )
  expect(app.readProposalCreationState().status).toBe('confirmed')

  // The read interface used by voting/payouts/attendance returns the same terms.
  const read = await app.readProposal(1n)
  expect(read.status).toBe('success')
  if (read.status === 'success') {
    expect(read.proposal).toEqual(result.proposal)
    expect(read.formattedAmount).toBe('12.5')
  }
  expect(await app.readProposalCount()).toMatchObject({ status: 'success', count: 1n })

  // A second proposal against another treasury continues the global sequence.
  const second = await app.createProposal({
    treasury: TREASURY_B,
    amount: '1',
    votingDeadline: DEADLINE,
  })
  expect(second.status).toBe('created')
  if (second.status === 'created') expect(second.proposal.id).toBe(2n)
  expect(state.proposals.size).toBe(2)
  expect((await app.readProposal(99n)).status).toBe('not-found')
})

test('creation does not depend on any voting NFT supply or ownership', async () => {
  const { app } = makeApp()
  await app.connect()
  await pinDraft(app)

  // The chain stub throws for any unexpected read, so a successful creation
  // proves no voting-NFT function was consulted.
  const result = await app.createProposal({
    treasury: TREASURY_A,
    amount: '1',
    votingDeadline: DEADLINE,
  })

  expect(result.status).toBe('created')
})

// ---------------------------------------------------------------------------
// Failure and retry
// ---------------------------------------------------------------------------

test('a rejected submission leaves the document pinned without a proposal', async () => {
  const { app, state } = makeApp('reject')
  await app.connect()
  await pinDraft(app)

  const result = await app.createProposal({
    treasury: TREASURY_A,
    amount: '1',
    votingDeadline: DEADLINE,
  })

  expect(result.status).toBe('rejected')
  expect(state.proposals.size).toBe(0)
  expect(app.readProposalPinState().status).toBe('pinned')

  const creation = app.readProposalCreationState()
  expect(creation.status).toBe('rejected')
  if (creation.status === 'rejected') {
    expect(creation.documentReference).toBe(`ipfs://${CID}`)
    expect(creation.message).toContain('no proposal was created')
  }
  expect(await app.readProposalCount()).toMatchObject({ status: 'success', count: 0n })
})

test('a reverted transaction after pinning is retryable and never fabricated', async () => {
  const { app, state } = makeApp('revert')
  await app.connect()
  await pinDraft(app)

  const failed = await app.createProposal({
    treasury: TREASURY_A,
    amount: '1',
    votingDeadline: DEADLINE,
  })

  expect(failed.status).toBe('failed')
  if (failed.status === 'failed') expect(failed.retryable).toBe(true)
  expect(state.proposals.size).toBe(0)
  expect(app.readProposalPinState().status).toBe('pinned')

  const creation = app.readProposalCreationState()
  expect(creation.status).toBe('failed')
  if (creation.status === 'failed') {
    expect(creation.documentReference).toBe(`ipfs://${CID}`)
    expect(creation.message).toContain('remains pinned')
  }

  // Explicit retry with the same pinned document creates the real proposal.
  state.outcome = 'success'
  const retried = await app.createProposal({
    treasury: TREASURY_A,
    amount: '1',
    votingDeadline: DEADLINE,
  })
  expect(retried.status).toBe('created')
  if (retried.status === 'created') expect(retried.proposal.id).toBe(1n)
  expect(app.readProposalCreationState().status).toBe('confirmed')
})

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

test('malformed creation inputs never reach the wallet', async () => {
  const { app, wallet } = makeApp()
  await app.connect()
  await pinDraft(app)

  const cases: Array<[Parameters<typeof app.createProposal>[0], string]> = [
    [{ treasury: 'not-an-address', amount: '1', votingDeadline: DEADLINE }, 'invalid-treasury'],
    [
      { treasury: '0x0000000000000000000000000000000000000099', amount: '1', votingDeadline: DEADLINE },
      'unregistered-treasury',
    ],
    [{ treasury: TREASURY_A, amount: '0', votingDeadline: DEADLINE }, 'invalid-amount'],
    [{ treasury: TREASURY_A, amount: '1.0000000000000000001', votingDeadline: DEADLINE }, 'invalid-amount'],
    [{ treasury: TREASURY_A, amount: '1', votingDeadline: 0 }, 'invalid-deadline'],
    [
      { treasury: TREASURY_A, amount: '1', votingDeadline: Math.floor(Date.now() / 1000) - 10 },
      'invalid-deadline',
    ],
  ]

  for (const [request, expected] of cases) {
    const result = await app.createProposal(request)
    expect(result.status).toBe(expected)
  }
  expect(wallet.sendTransaction).not.toHaveBeenCalled()
})

test('creation requires a wallet and a configured deployment', async () => {
  const { app } = makeApp()
  await pinDraft(app)
  const disconnected = await app.createProposal({
    treasury: TREASURY_A,
    amount: '1',
    votingDeadline: DEADLINE,
  })
  expect(disconnected.status).toBe('wallet-not-connected')

  const unconfigured = createApplication(undefined, undefined, {
    chainId: 31337,
    daoAddress: null,
    testUsdAddress: null,
  })
  expect((await unconfigured.readProposal(1n)).status).toBe('unconfigured')
  expect((await unconfigured.readProposalCount()).status).toBe('unconfigured')
})
