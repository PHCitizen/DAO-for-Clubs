/**
 * Behavioral tests for voting NFT minting and membership inspection — issue 02.05.
 *
 * All tests go through createApplication() with controlled WalletAdapter and
 * RpcAdapter stubs that emulate the treasury registry and the treasury's
 * non-transferable voting NFTs. No React hooks, no DOM, no browser APIs.
 */
import { expect, test, vi } from 'vitest'
import { getAddress, type Hex } from 'viem'
import { createApplication } from './application'
import type { ContractReadRequest } from './treasury'
import type { TestUsdTransactionLog } from './testusd'
import type { ContractWriteRequest, WalletAdapter } from './wallet'
import type { RpcAdapter } from './rpc'

const DAO = '0x00000000000000000000000000000000000000a0' as const
const TREASURY_A = '0x00000000000000000000000000000000000000a1' as const
const TREASURY_B = '0x00000000000000000000000000000000000000b2' as const
const ADMIN_A = '0x00000000000000000000000000000000000000d4' as const
const ADMIN_B = '0x00000000000000000000000000000000000000e5' as const
const HOLDER = '0x00000000000000000000000000000000000000a7' as const
const OTHER_HOLDER = '0x00000000000000000000000000000000000000c8' as const
const MINT_HASH = `0x${'cd'.repeat(32)}` as const
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const

const DEPLOYMENT = { chainId: 31337, daoAddress: DAO } as const

/** Lowercases an address for case-insensitive map lookup. */
function normalizeKey(address: string): string {
  return address.toLowerCase()
}

type MintOutcome = 'success' | 'reject' | 'submit-error' | 'revert' | 'confirmation-error'

interface MembershipStubState {
  chainId: number
  connectedAccount: `0x${string}`
  treasuries: Record<string, `0x${string}`>
  /** treasury -> holder -> token IDs */
  memberships: Record<string, Record<string, bigint[]>>
  outcome: MintOutcome
  sent: Array<{ from: `0x${string}`; to: `0x${string}`; functionName: string; args: readonly unknown[] }>
}

function makeMembershipHarness(overrides: Partial<MembershipStubState> = {}) {
  const state: MembershipStubState = {
    chainId: 31337,
    connectedAccount: ADMIN_A,
    treasuries: { [normalizeKey(TREASURY_A)]: getAddress(ADMIN_A) },
    memberships: { [normalizeKey(TREASURY_A)]: {} },
    outcome: 'success',
    sent: [],
    ...overrides,
  }

  // Monotonic per-treasury token ID allocation, mirroring the contract's
  // _nextTokenId: seeded above any pre-existing IDs and never reused.
  const nextTokenIds = new Map<string, bigint>()
  function allocateTokenId(treasury: string): bigint {
    let next = nextTokenIds.get(treasury)
    if (next === undefined) {
      const seeded = Object.values(state.memberships[treasury] ?? {}).flat()
      next = seeded.reduce((max, id) => (id > max ? id : max), 0n) + 1n
    }
    nextTokenIds.set(treasury, next + 1n)
    return next
  }

  const rpc = {
    getChainId: vi.fn(async () => state.chainId),
    getBlockNumber: vi.fn(async () => 1n),
    readContract: vi.fn(async (request: ContractReadRequest): Promise<unknown> => {
      const treasury = normalizeKey(request.address)
      const members = state.memberships[treasury] ?? {}
      const supply = Object.values(members).reduce((sum, tokens) => sum + BigInt(tokens.length), 0n)
      switch (request.functionName) {
        case 'isTreasury':
          return normalizeKey(request.args?.[0] as string) in state.treasuries
        case 'administrator':
          return state.treasuries[treasury]
        case 'totalSupply':
          return supply
        case 'balanceOf':
          return BigInt(members[normalizeKey(request.args?.[0] as string)]?.length ?? 0)
        case 'tokensOfHolder':
          return members[normalizeKey(request.args?.[0] as string)] ?? []
        default:
          throw new Error(`Unexpected membership read: ${request.functionName}`)
      }
    }),
    waitForTransactionReceipt: vi.fn(async (hash: Hex) => {
      if (state.outcome === 'confirmation-error') throw new Error('receipt unavailable')
      const last = state.sent[state.sent.length - 1]
      if (!last) throw new Error(`Unknown transaction ${hash}`)
      if (state.outcome === 'revert') return { status: 'reverted' as const, blockNumber: 123n, logs: [] }

      const treasury = normalizeKey(last.to)
      if (last.functionName === 'burnVotingNft') {
        const tokenId = last.args[0] as bigint
        const members = state.memberships[treasury] ?? {}
        const entry = Object.entries(members).find(([, ids]) => ids.includes(tokenId))
        if (!entry) return { status: 'reverted' as const, blockNumber: 123n, logs: [] }
        const [holder, ids] = entry
        members[holder] = ids.filter(id => id !== tokenId)
        return { status: 'success' as const, blockNumber: 123n, logs: [{
          address: getAddress(last.to), data: '0x', topics: [TRANSFER_TOPIC,
            `0x${holder.slice(2).padStart(64, '0')}`,
            `0x${'0'.repeat(64)}`, `0x${tokenId.toString(16).padStart(64, '0')}`],
        }] }
      }
      const holder = getAddress(last.args[0] as string)
      const members = (state.memberships[treasury] ??= {})
      const tokens = (members[normalizeKey(holder)] ??= [])
      const tokenId = allocateTokenId(treasury)
      tokens.push(tokenId)
      const mintLog: TestUsdTransactionLog = {
        address: getAddress(last.to),
        data: '0x',
        topics: [
          TRANSFER_TOPIC,
          `0x${'0'.repeat(64)}`,
          `0x${holder.slice(2).toLowerCase().padStart(64, '0')}`,
          `0x${tokenId.toString(16).padStart(64, '0')}`,
        ],
      }
      return { status: 'success' as const, blockNumber: 123n, logs: [mintLog] }
    }),
  } as unknown as RpcAdapter

  const adapter: WalletAdapter = {
    isAvailable: () => true,
    signMessage: vi.fn().mockResolvedValue('0x'),
    connect: vi.fn().mockResolvedValue(state.connectedAccount),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getAccount: vi.fn().mockResolvedValue(state.connectedAccount),
    getChainId: vi.fn().mockResolvedValue(state.chainId),
    onAccountChanged: () => () => {},
    onChainChanged: () => () => {},
    switchChain: vi.fn().mockResolvedValue(undefined),
    sendTransaction: vi.fn(async (request: ContractWriteRequest) => {
      if (state.outcome === 'reject') throw Object.assign(new Error('Rejected'), { code: 4001 })
      if (state.outcome === 'submit-error') throw new Error('nonce too low')
      state.sent.push({
        from: request.from,
        to: request.to,
        functionName: request.functionName,
        args: request.args ?? [],
      })
      return MINT_HASH
    }),
  }

  return { state, rpc, adapter }
}

test('burn confirms removal, updated supply, and repeat-burn failure through application functions', async () => {
  const { rpc, adapter } = makeMembershipHarness({
    memberships: { [normalizeKey(TREASURY_A)]: { [normalizeKey(HOLDER)]: [1n, 2n] } },
  })
  const app = createApplication(adapter, rpc, DEPLOYMENT)
  await app.connect()
  const result = await app.burnVotingNft({ treasury: TREASURY_A, tokenId: '1' })
  expect(result).toMatchObject({ status: 'success', tokenId: 1n, holder: getAddress(HOLDER),
    totalSupply: 1n, holderBalance: 1n, holderTokenIds: [2n] })
  expect(await app.burnVotingNft({ treasury: TREASURY_A, tokenId: '1' }))
    .toMatchObject({ status: 'transaction-failed', stage: 'reverted' })
  app.destroy()
})

test.each(['reject', 'submit-error', 'revert', 'confirmation-error'] as const)(
  'burn distinguishes %s without reporting removal', async (outcome) => {
    const { rpc, adapter } = makeMembershipHarness({ outcome })
    const app = createApplication(adapter, rpc, DEPLOYMENT)
    await app.connect()
    const result = await app.burnVotingNft({ treasury: TREASURY_A, tokenId: '1' })
    expect(result).toMatchObject(outcome === 'reject' ? { status: 'wallet-rejected' } : {
      status: 'transaction-failed', stage: outcome === 'submit-error' ? 'submission' : outcome === 'revert' ? 'reverted' : 'confirmation',
    })
    app.destroy()
  }
)

test('a successful receipt without a matching burn event is not confirmed removal', async () => {
  const { rpc, adapter } = makeMembershipHarness()
  rpc.waitForTransactionReceipt = async () => ({ status: 'success', blockNumber: 123n, logs: [] })
  const app = createApplication(adapter, rpc, DEPLOYMENT)
  await app.connect()
  expect(await app.burnVotingNft({ treasury: TREASURY_A, tokenId: '1' }))
    .toMatchObject({ status: 'transaction-failed', stage: 'confirmation', hash: MINT_HASH })
  app.destroy()
})

test('burn validates scoped identity and administrator before submission', async () => {
  const { state, rpc, adapter } = makeMembershipHarness()
  const app = createApplication(adapter, rpc, DEPLOYMENT)
  await app.connect()
  for (const tokenId of ['0', '-1', '1.5', 'abc', (2n ** 256n).toString()]) {
    expect((await app.burnVotingNft({ treasury: TREASURY_A, tokenId })).status).toBe('invalid-token')
  }
  expect((await app.burnVotingNft({ treasury: TREASURY_B, tokenId: '1' })).status).toBe('not-found')
  state.treasuries[normalizeKey(TREASURY_A)] = getAddress(ADMIN_B)
  expect((await app.burnVotingNft({ treasury: TREASURY_A, tokenId: '1' })).status).toBe('unauthorized')
  expect(state.sent).toEqual([])
  app.destroy()
})

test('a wallet-free holder inspects live supply and confirmed credential ownership', async () => {
  const { rpc } = makeMembershipHarness({
    memberships: { [normalizeKey(TREASURY_A)]: { [normalizeKey(HOLDER)]: [1n, 2n], [normalizeKey(OTHER_HOLDER)]: [3n] } },
  })
  const app = createApplication(undefined, rpc, DEPLOYMENT)

  const result = await app.readVotingMembership(TREASURY_A, HOLDER)

  expect(result.status).toBe('success')
  if (result.status !== 'success') return
  expect(result.chainId).toBe(31337)
  expect(result.membership.treasury).toBe(getAddress(TREASURY_A))
  expect(result.membership.administrator).toBe(getAddress(ADMIN_A))
  expect(result.membership.totalSupply).toBe(3n)
  expect(result.membership.holder).toEqual({
    address: getAddress(HOLDER),
    balance: 2n,
    tokenIds: [1n, 2n],
  })
  expect(app.readWalletAccount()).toEqual({ status: 'disconnected' })
})

test('live supply inspection does not require a holder address', async () => {
  const { rpc } = makeMembershipHarness({
    memberships: { [normalizeKey(TREASURY_A)]: { [normalizeKey(HOLDER)]: [1n] } },
  })
  const app = createApplication(undefined, rpc, DEPLOYMENT)

  const result = await app.readVotingMembership(TREASURY_A)

  expect(result.status).toBe('success')
  if (result.status !== 'success') return
  expect(result.membership.totalSupply).toBe(1n)
  expect(result.membership.holder).toBeNull()
})

test('membership inspection distinguishes unregistered treasuries and bad addresses', async () => {
  const { rpc } = makeMembershipHarness()
  const app = createApplication(undefined, rpc, DEPLOYMENT)

  const unregistered = await app.readVotingMembership(TREASURY_B, HOLDER)
  expect(unregistered).toEqual({ status: 'not-found', address: TREASURY_B, reason: 'unregistered' })

  const malformed = await app.readVotingMembership('not-an-address', HOLDER)
  expect(malformed.status).toBe('not-found')

  const badHolder = await app.readVotingMembership(TREASURY_A, 'not-an-address')
  expect(badHolder.status).toBe('not-found')
})

test('membership reads are unconfigured without a deployment or RPC seam', async () => {
  const app = createApplication(undefined, undefined, { chainId: 999999, daoAddress: null, rpcUrl: undefined })
  expect((await app.readVotingMembership(TREASURY_A)).status).toBe('unconfigured')
})

test('the treasury administrator mints and sees the confirmed token ID, supply, and holder credentials', async () => {
  const { state, rpc, adapter } = makeMembershipHarness({
    memberships: { [normalizeKey(TREASURY_A)]: { [normalizeKey(HOLDER)]: [1n] } },
  })
  const app = createApplication(adapter, rpc, DEPLOYMENT)
  await app.connect()

  const result = await app.mintVotingNft({ treasury: TREASURY_A, holder: HOLDER })

  expect(result.status).toBe('success')
  if (result.status !== 'success') return
  expect(result.chainId).toBe(31337)
  expect(result.hash).toBe(MINT_HASH)
  expect(result.blockNumber).toBe(123n)
  expect(result.treasury).toBe(getAddress(TREASURY_A))
  expect(result.holder).toBe(getAddress(HOLDER))
  expect(result.tokenId).toBe(2n)
  expect(result.totalSupply).toBe(2n)
  expect(result.holderBalance).toBe(2n)
  expect(result.holderTokenIds).toEqual([1n, 2n])

  expect(state.sent).toEqual([
    {
      from: getAddress(ADMIN_A),
      to: getAddress(TREASURY_A),
      functionName: 'mintVotingNft',
      args: [getAddress(HOLDER)],
    },
  ])
})

test('a connected wallet that is not the treasury administrator gets unauthorized feedback without a transaction', async () => {
  const { state, rpc, adapter } = makeMembershipHarness({ connectedAccount: OTHER_HOLDER })
  const app = createApplication(adapter, rpc, DEPLOYMENT)
  await app.connect()

  const result = await app.mintVotingNft({ treasury: TREASURY_A, holder: HOLDER })

  expect(result.status).toBe('unauthorized')
  if (result.status === 'unauthorized') {
    expect(result.account).toBe(getAddress(OTHER_HOLDER))
    expect(result.administrator).toBe(getAddress(ADMIN_A))
  }
  expect(state.sent).toHaveLength(0)
})

test('one treasury administrator cannot mint for another treasury', async () => {
  const { state, rpc, adapter } = makeMembershipHarness({
    treasuries: { [normalizeKey(TREASURY_A)]: getAddress(ADMIN_A), [normalizeKey(TREASURY_B)]: getAddress(ADMIN_B) },
    memberships: { [normalizeKey(TREASURY_A)]: {}, [normalizeKey(TREASURY_B)]: {} },
    connectedAccount: ADMIN_A,
  })
  const app = createApplication(adapter, rpc, DEPLOYMENT)
  await app.connect()

  const result = await app.mintVotingNft({ treasury: TREASURY_B, holder: HOLDER })

  expect(result.status).toBe('unauthorized')
  if (result.status === 'unauthorized') {
    expect(result.administrator).toBe(getAddress(ADMIN_B))
  }
  expect(state.sent).toHaveLength(0)
})

test('minting to an invalid or zero holder address is rejected before sending', async () => {
  const { state, rpc, adapter } = makeMembershipHarness()
  const app = createApplication(adapter, rpc, DEPLOYMENT)
  await app.connect()

  for (const holder of ['not-an-address', '0x0000000000000000000000000000000000000000']) {
    const result = await app.mintVotingNft({ treasury: TREASURY_A, holder })
    expect(result.status).toBe('invalid-holder')
  }
  expect(state.sent).toHaveLength(0)
})

test('minting for an unregistered treasury fails without a transaction', async () => {
  const { state, rpc, adapter } = makeMembershipHarness()
  const app = createApplication(adapter, rpc, DEPLOYMENT)
  await app.connect()

  const result = await app.mintVotingNft({ treasury: TREASURY_B, holder: HOLDER })

  expect(result.status).toBe('not-found')
  expect(state.sent).toHaveLength(0)
})

test('minting requires a connected wallet', async () => {
  const { rpc } = makeMembershipHarness()
  const app = createApplication(undefined, rpc, DEPLOYMENT)

  const result = await app.mintVotingNft({ treasury: TREASURY_A, holder: HOLDER })

  expect(result.status).toBe('wallet-unavailable')
})

test('a wallet-rejected mint is not reported as success', async () => {
  const { state, rpc, adapter } = makeMembershipHarness({ outcome: 'reject' })
  const app = createApplication(adapter, rpc, DEPLOYMENT)
  await app.connect()

  const result = await app.mintVotingNft({ treasury: TREASURY_A, holder: HOLDER })

  expect(result.status).toBe('wallet-rejected')
  expect(state.sent).toHaveLength(0)
})

test('a submission failure is distinct from a confirmed mint', async () => {
  const { rpc, adapter } = makeMembershipHarness({ outcome: 'submit-error' })
  const app = createApplication(adapter, rpc, DEPLOYMENT)
  await app.connect()

  const result = await app.mintVotingNft({ treasury: TREASURY_A, holder: HOLDER })

  expect(result.status).toBe('transaction-failed')
  if (result.status === 'transaction-failed') {
    expect(result.stage).toBe('submission')
    expect(result.error).toContain('nonce too low')
  }
})

test('a reverted mint is reported as failed with the transaction hash and unchanged supply', async () => {
  const { rpc, adapter } = makeMembershipHarness({ outcome: 'revert' })
  const app = createApplication(adapter, rpc, DEPLOYMENT)
  await app.connect()

  const result = await app.mintVotingNft({ treasury: TREASURY_A, holder: HOLDER })

  expect(result.status).toBe('transaction-failed')
  if (result.status === 'transaction-failed') {
    expect(result.stage).toBe('reverted')
    expect(result.hash).toBe(MINT_HASH)
  }

  const after = await app.readVotingMembership(TREASURY_A, HOLDER)
  expect(after.status).toBe('success')
  if (after.status === 'success') {
    expect(after.membership.totalSupply).toBe(0n)
    expect(after.membership.holder?.tokenIds).toEqual([])
  }
})

test('an unconfirmed mint is distinguished from a confirmed success', async () => {
  const { rpc, adapter } = makeMembershipHarness({ outcome: 'confirmation-error' })
  const app = createApplication(adapter, rpc, DEPLOYMENT)
  await app.connect()

  const result = await app.mintVotingNft({ treasury: TREASURY_A, holder: HOLDER })

  expect(result.status).toBe('transaction-failed')
  if (result.status === 'transaction-failed') {
    expect(result.stage).toBe('confirmation')
    expect(result.hash).toBe(MINT_HASH)
  }
})

test('membership operations reject a different chain instead of mixing deployments', async () => {
  const { rpc, adapter } = makeMembershipHarness({ chainId: 1 })
  const app = createApplication(adapter, rpc, DEPLOYMENT)
  await app.connect()

  const read = await app.readVotingMembership(TREASURY_A, HOLDER)
  expect(read).toEqual({ status: 'chain-mismatch', expectedChainId: 31337, actualChainId: 1 })

  const mint = await app.mintVotingNft({ treasury: TREASURY_A, holder: HOLDER })
  expect(mint.status).toBe('chain-mismatch')
})
