import { afterEach, expect, test, vi } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { createApplication } from './application'
import { WalletRejectedError } from './wallet'
import type { RpcAdapter } from './rpc'
import { type AccountChangedListener, type ChainChangedListener, type WalletAdapter } from './wallet'

const DAO = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as const
const OTHER_DAO = '0x00000000000000000000000000000000000000d1' as const
// Hardhat account #0: RFC 6979 signing makes personal_sign reproducible.
const SIGNER = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
const OTHER_SIGNER = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const SIGNATURE =
  '0xd3cdda5f225fa4b153a6c6a5b47173b568300633d82a6ff334c64d277c9a7cf25d8169f020e7f3550850d16c8ea588032d23ddd33e6f4caa7e0c3c834523037b1b'
const SECRET = 'aa66bdf12269f5ac9e972bb035ff03ad5a01398a8886a047fe33b71df9feae02'
const ENTRY = '0x875e44e768dec6589cfd78200bf53ff8d24e9fa1359a676f582b24da8834130e'

afterEach(() => vi.restoreAllMocks())

function setup(options: {
  chainId?: number
  walletChainId?: number
  daoAddress?: `0x${string}` | null
  sign?: (account: string, message: string) => Promise<`0x${string}`>
} = {}) {
  const chainId = options.chainId ?? 31337
  const listeners = { account: new Set<AccountChangedListener>(), chain: new Set<ChainChangedListener>() }
  const sign =
    options.sign ?? ((_account: string, message: string) => SIGNER.signMessage({ message }))
  const signMessage = vi.fn(sign)
  const wallet = {
    isAvailable: () => true,
    connect: vi.fn(async () => SIGNER.address),
    disconnect: vi.fn(async () => {}),
    getAccount: vi.fn(async () => SIGNER.address),
    getChainId: vi.fn(async () => options.walletChainId ?? chainId),
    onAccountChanged: (l: AccountChangedListener) => (listeners.account.add(l), () => listeners.account.delete(l)),
    onChainChanged: (l: ChainChangedListener) => (listeners.chain.add(l), () => listeners.chain.delete(l)),
    switchChain: vi.fn(async () => {}),
    sendTransaction: vi.fn(),
    signMessage,
  } as unknown as WalletAdapter
  // No chain reads are expected: credentials need no NFT, balance, or funding.
  const readContract = vi.fn(async () => {
    throw new Error('attendance preparation must not read contract state')
  })
  const rpc = { getChainId: vi.fn(async () => chainId), readContract } as unknown as RpcAdapter
  const app = createApplication(wallet, rpc, {
    chainId,
    daoAddress: options.daoAddress === undefined ? DAO : options.daoAddress,
  })
  return { app, signMessage, listeners, readContract }
}

test('a connected attendee signs the frozen message and gets a QR with only public fields', async () => {
  const { app, signMessage, readContract } = setup()
  await app.connect()

  const result = await app.prepareAttendanceCredential({ proposalId: 1n })

  expect(result.status).toBe('ready')
  if (result.status !== 'ready') return
  expect(signMessage).toHaveBeenCalledExactlyOnceWith(
    SIGNER.address,
    'DAO for Clubs attendance v1\nChain ID: 31337\nDAO: 0x5FbDB2315678afecb367f032d93F642f64180aa3\nProposal ID: 1'
  )
  expect(result.entry).toBe(ENTRY)
  expect(JSON.parse(result.qr)).toEqual({
    v: 1,
    chainId: 31337,
    dao: DAO,
    proposalId: '1',
    entry: ENTRY,
  })
  expect(readContract).not.toHaveBeenCalled()
  // Secret, signature, attendee address, and names never appear in outputs.
  const publicOutput = JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).toLowerCase()
  for (const forbidden of [SECRET, SIGNATURE.slice(2), SIGNER.address.toLowerCase().slice(2)]) {
    expect(publicOutput).not.toContain(forbidden)
  }
})

test('signing again with the same account recovers the same entry; other events stay separate', async () => {
  const first = setup()
  await first.app.connect()
  const a = await first.app.prepareAttendanceCredential({ proposalId: 1n })
  const again = await first.app.prepareAttendanceCredential({ proposalId: 1n })
  const otherEvent = await first.app.prepareAttendanceCredential({ proposalId: 2n })

  const fresh = setup()
  await fresh.app.connect()
  const recovered = await fresh.app.prepareAttendanceCredential({ proposalId: 1n })

  const otherDeployment = setup({ daoAddress: OTHER_DAO })
  await otherDeployment.app.connect()
  const otherDao = await otherDeployment.app.prepareAttendanceCredential({ proposalId: 1n })

  const otherChain = setup({ chainId: 97 })
  await otherChain.app.connect()
  const otherChainResult = await otherChain.app.prepareAttendanceCredential({ proposalId: 1n })

  const entries = [a, again, recovered, otherEvent, otherDao, otherChainResult].map((r) =>
    r.status === 'ready' ? r.entry : r.status
  )
  expect(entries[0]).toBe(ENTRY)
  expect(entries[1]).toBe(ENTRY)
  expect(entries[2]).toBe(ENTRY)
  expect(new Set(entries.slice(2)).size).toBe(4)
  expect(entries.every((e) => e.startsWith('0x'))).toBe(true)
})

test('different signing output does not recover the same entry', async () => {
  const { app } = setup({ sign: (_account, message) => OTHER_SIGNER.signMessage({ message }) })
  await app.connect()
  const result = await app.prepareAttendanceCredential({ proposalId: 1n })
  expect(result.status).toBe('ready')
  expect(result.status === 'ready' && result.entry).not.toBe(ENTRY)
})

test('wallet rejection yields no credential', async () => {
  const { app } = setup({
    sign: async () => {
      throw new WalletRejectedError()
    },
  })
  await app.connect()
  const result = await app.prepareAttendanceCredential({ proposalId: 1n })
  expect(result.status).toBe('wallet-rejected')
  expect('qr' in result).toBe(false)
})

test('signing failures are reported without a credential or any logging', async () => {
  const spies = (['log', 'info', 'debug', 'error', 'warn'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
  const failing = setup({ sign: async () => { throw new Error('wallet crashed') } })
  await failing.app.connect()
  const failed = await failing.app.prepareAttendanceCredential({ proposalId: 1n })
  expect(failed.status).toBe('signing-failed')
  expect('qr' in failed).toBe(false)

  const ok = setup()
  await ok.app.connect()
  await ok.app.prepareAttendanceCredential({ proposalId: 1n })
  for (const spy of spies) expect(spy).not.toHaveBeenCalled()
})

test('an invalid proposal ID is refused before the wallet is asked to sign', async () => {
  const { app, signMessage } = setup()
  await app.connect()
  for (const proposalId of [-1n, 2n ** 256n]) {
    expect((await app.prepareAttendanceCredential({ proposalId })).status).toBe('invalid-proposal-id')
  }
  expect(signMessage).not.toHaveBeenCalled()
})

test('a malformed signature is not turned into a credential', async () => {
  const { app } = setup({ sign: async () => '0x1234' })
  await app.connect()
  expect((await app.prepareAttendanceCredential({ proposalId: 1n })).status).toBe('signing-failed')
})

test('account or network changes while signing do not produce a stale successful credential', async () => {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const accountChange = setup({
    sign: async (_a, message) => {
      await gate
      return SIGNER.signMessage({ message })
    },
  })
  await accountChange.app.connect()
  const pending = accountChange.app.prepareAttendanceCredential({ proposalId: 1n })
  await vi.waitFor(() => expect(accountChange.signMessage).toHaveBeenCalled())
  for (const l of accountChange.listeners.account) l({ account: '0x00000000000000000000000000000000000000c3' })
  release()
  expect((await pending).status).toBe('stale-configuration')

  let release2!: () => void
  const gate2 = new Promise<void>((r) => (release2 = r))
  const chainChange = setup({
    sign: async (_a, message) => {
      await gate2
      return SIGNER.signMessage({ message })
    },
  })
  await chainChange.app.connect()
  const pending2 = chainChange.app.prepareAttendanceCredential({ proposalId: 1n })
  await vi.waitFor(() => expect(chainChange.signMessage).toHaveBeenCalled())
  for (const l of chainChange.listeners.chain) l({ chainId: 1 })
  release2()
  expect((await pending2).status).toBe('stale-configuration')
})

test('refuses to sign without a connected wallet, on the wrong network, or without a deployment', async () => {
  const disconnected = setup()
  expect((await disconnected.app.prepareAttendanceCredential({ proposalId: 1n })).status).toBe('wallet-not-connected')

  const wrongNetwork = setup({ walletChainId: 1 })
  await wrongNetwork.app.connect()
  expect((await wrongNetwork.app.prepareAttendanceCredential({ proposalId: 1n })).status).toBe('chain-mismatch')

  const undeployed = setup({ daoAddress: null })
  await undeployed.app.connect()
  expect((await undeployed.app.prepareAttendanceCredential({ proposalId: 1n })).status).toBe('unconfigured')

  for (const s of [disconnected, wrongNetwork, undeployed]) expect(s.signMessage).not.toHaveBeenCalled()
})
