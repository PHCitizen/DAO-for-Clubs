/**
 * Behavioral tests for wallet connection — issue 01.02.
 *
 * All tests go through createApplication() with controlled WalletAdapter
 * stubs. No React hooks, no DOM, no browser APIs are involved.
 *
 * Real-wallet smoke check
 * -----------------------
 * To verify against an actual wallet extension (e.g. MetaMask):
 *   1. `pnpm dev`
 *   2. Open http://localhost:3000 in a browser with the extension installed.
 *   3. Click "Connect wallet" — confirm the extension prompt appears.
 *   4. Approve the connection — confirm the address appears in the UI.
 *   5. Switch accounts in the extension — confirm the UI updates immediately.
 *   6. Disconnect in the extension — confirm the UI returns to disconnected state.
 *   7. Click "Connect wallet" again — confirm reconnect works without reload.
 */

import { expect, test, vi } from 'vitest'
import { createApplication } from './application'
import {
  type WalletAdapter,
  type AccountChangedListener,
  WalletRejectedError,
  WalletUnavailableError,
  WalletConnectError,
} from './wallet'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type ControlledAdapter = WalletAdapter & {
  /** Simulate the wallet firing an accountsChanged event. */
  simulateAccountChange(account: `0x${string}` | null): void
}

function makeAdapter(overrides?: Partial<WalletAdapter>): ControlledAdapter {
  let accountChangeListener: AccountChangedListener | null = null

  const defaults: WalletAdapter = {
    isAvailable: () => true,
    connect: vi.fn().mockResolvedValue('0xABCDEF0123456789ABCDEF0123456789ABCDEF01' as `0x${string}`),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getAccount: vi.fn().mockResolvedValue(null),
    onAccountChanged(listener) {
      accountChangeListener = listener
      return () => { accountChangeListener = null }
    },
  }

  return Object.assign({}, defaults, overrides, {
    simulateAccountChange(account: `0x${string}` | null) {
      accountChangeListener?.({ account })
    },
  })
}

const ACCOUNT_A = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA01' as const
const ACCOUNT_B = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB02' as const

// ---------------------------------------------------------------------------
// Read-only content without wallet
// ---------------------------------------------------------------------------

test('a visitor can read the welcome content without a wallet or RPC', () => {
  const application = createApplication()
  expect(application.readHome()).toEqual({
    title: 'DAO for Clubs',
    description: 'Explore your organization. No wallet required to get started.',
    deploymentMessage: 'No DAO has been deployed by this scaffold.',
  })
})

test('wallet state starts as disconnected', () => {
  const application = createApplication()
  expect(application.readWalletAccount()).toEqual({ status: 'disconnected' })
})

test('read-only content is accessible without a wallet adapter', () => {
  const application = createApplication(undefined)
  const home = application.readHome()
  expect(home.title).toBe('DAO for Clubs')
  expect(home.description).toContain('No wallet required')
})

// ---------------------------------------------------------------------------
// Wallet availability
// ---------------------------------------------------------------------------

test('isWalletAvailable returns false when no adapter is supplied', () => {
  expect(createApplication().isWalletAvailable()).toBe(false)
})

test('isWalletAvailable returns false when adapter reports unavailable', () => {
  const adapter = makeAdapter({ isAvailable: () => false })
  expect(createApplication(adapter).isWalletAvailable()).toBe(false)
})

test('isWalletAvailable returns true when adapter reports available', () => {
  const adapter = makeAdapter({ isAvailable: () => true })
  expect(createApplication(adapter).isWalletAvailable()).toBe(true)
})

// ---------------------------------------------------------------------------
// Successful connect
// ---------------------------------------------------------------------------

test('connect transitions through connecting then connected', async () => {
  const adapter = makeAdapter({
    connect: vi.fn().mockResolvedValue(ACCOUNT_A),
  })
  const app = createApplication(adapter)
  const states: string[] = []
  app.onWalletStateChanged(s => states.push(s.status))

  await app.connect()

  expect(states).toEqual(['connecting', 'connected'])
  const state = app.readWalletAccount()
  expect(state.status).toBe('connected')
  if (state.status === 'connected') {
    expect(state.account).toBe(ACCOUNT_A)
  }
})

test('connect calls the adapter connect method', async () => {
  const connectFn = vi.fn().mockResolvedValue(ACCOUNT_A)
  const adapter = makeAdapter({ connect: connectFn })
  const app = createApplication(adapter)
  await app.connect()
  expect(connectFn).toHaveBeenCalledOnce()
})

// ---------------------------------------------------------------------------
// Rejected connection
// ---------------------------------------------------------------------------

test('rejected connection produces error state with retry hint', async () => {
  const adapter = makeAdapter({
    connect: vi.fn().mockRejectedValue(new WalletRejectedError()),
  })
  const app = createApplication(adapter)
  await app.connect()

  const state = app.readWalletAccount()
  expect(state.status).toBe('error')
  if (state.status === 'error') {
    expect(state.error.kind).toBe('wallet-rejected')
    expect(state.error.message).toContain('rejected')
  }
})

test('EIP-1193 code 4001 is normalized to wallet-rejected', async () => {
  const eip1193Rejection = Object.assign(new Error('User rejected'), { code: 4001 })
  const adapter = makeAdapter({
    connect: vi.fn().mockRejectedValue(eip1193Rejection),
  })
  const app = createApplication(adapter)
  await app.connect()

  const state = app.readWalletAccount()
  expect(state.status).toBe('error')
  if (state.status === 'error') {
    expect(state.error.kind).toBe('wallet-rejected')
  }
})

// ---------------------------------------------------------------------------
// Wallet unavailable
// ---------------------------------------------------------------------------

test('connecting with no adapter emits wallet-unavailable error', async () => {
  const app = createApplication(undefined)
  await app.connect()
  const state = app.readWalletAccount()
  expect(state.status).toBe('error')
  if (state.status === 'error') {
    expect(state.error.kind).toBe('wallet-unavailable')
  }
})

test('WalletUnavailableError from adapter is surfaced correctly', async () => {
  const adapter = makeAdapter({
    connect: vi.fn().mockRejectedValue(new WalletUnavailableError()),
  })
  const app = createApplication(adapter)
  await app.connect()

  const state = app.readWalletAccount()
  expect(state.status).toBe('error')
  if (state.status === 'error') {
    expect(state.error.kind).toBe('wallet-unavailable')
  }
})

// ---------------------------------------------------------------------------
// Reconnect after error (retry without reload)
// ---------------------------------------------------------------------------

test('a second connect call after rejection succeeds without reload', async () => {
  const connectFn = vi.fn()
    .mockRejectedValueOnce(new WalletRejectedError())
    .mockResolvedValueOnce(ACCOUNT_A)
  const adapter = makeAdapter({ connect: connectFn })
  const app = createApplication(adapter)

  await app.connect()
  expect(app.readWalletAccount().status).toBe('error')

  await app.connect()
  const state = app.readWalletAccount()
  expect(state.status).toBe('connected')
  if (state.status === 'connected') {
    expect(state.account).toBe(ACCOUNT_A)
  }
})

// ---------------------------------------------------------------------------
// Account switch
// ---------------------------------------------------------------------------

test('account switch updates connected account without re-requesting', async () => {
  const adapter = makeAdapter({ connect: vi.fn().mockResolvedValue(ACCOUNT_A) })
  const app = createApplication(adapter)
  await app.connect()

  adapter.simulateAccountChange(ACCOUNT_B)

  const state = app.readWalletAccount()
  expect(state.status).toBe('connected')
  if (state.status === 'connected') {
    expect(state.account).toBe(ACCOUNT_B)
  }
})

test('account switch notifies listeners', async () => {
  const adapter = makeAdapter({ connect: vi.fn().mockResolvedValue(ACCOUNT_A) })
  const app = createApplication(adapter)
  await app.connect()

  const observed: string[] = []
  app.onWalletStateChanged(s => {
    if (s.status === 'connected') observed.push(s.account)
  })

  adapter.simulateAccountChange(ACCOUNT_B)
  expect(observed).toEqual([ACCOUNT_B])
})

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

test('disconnect returns state to disconnected', async () => {
  const adapter = makeAdapter({ connect: vi.fn().mockResolvedValue(ACCOUNT_A) })
  const app = createApplication(adapter)
  await app.connect()
  await app.disconnect()
  expect(app.readWalletAccount()).toEqual({ status: 'disconnected' })
})

test('disconnect calls the adapter disconnect method', async () => {
  const disconnectFn = vi.fn().mockResolvedValue(undefined)
  const adapter = makeAdapter({ connect: vi.fn().mockResolvedValue(ACCOUNT_A), disconnect: disconnectFn })
  const app = createApplication(adapter)
  await app.connect()
  await app.disconnect()
  expect(disconnectFn).toHaveBeenCalledOnce()
})

test('after disconnect, account change events are ignored', async () => {
  const adapter = makeAdapter({ connect: vi.fn().mockResolvedValue(ACCOUNT_A) })
  const app = createApplication(adapter)
  await app.connect()
  await app.disconnect()

  adapter.simulateAccountChange(ACCOUNT_B)
  expect(app.readWalletAccount()).toEqual({ status: 'disconnected' })
})

// ---------------------------------------------------------------------------
// Disconnect from wallet side (account removed)
// ---------------------------------------------------------------------------

test('wallet-side disconnect (empty accounts event) transitions to disconnected', async () => {
  const adapter = makeAdapter({ connect: vi.fn().mockResolvedValue(ACCOUNT_A) })
  const app = createApplication(adapter)
  await app.connect()

  adapter.simulateAccountChange(null)

  expect(app.readWalletAccount()).toEqual({ status: 'disconnected' })
})

// ---------------------------------------------------------------------------
// Subscription and listener cleanup
// ---------------------------------------------------------------------------

test('unsubscribe stops state notifications', async () => {
  const adapter = makeAdapter({ connect: vi.fn().mockResolvedValue(ACCOUNT_A) })
  const app = createApplication(adapter)
  const received: string[] = []
  const unsub = app.onWalletStateChanged(s => received.push(s.status))

  await app.connect()
  unsub()
  await app.disconnect()

  // Only events before unsubscribe should be recorded.
  expect(received).not.toContain('disconnected')
})

test('multiple listeners each receive state changes', async () => {
  const adapter = makeAdapter({ connect: vi.fn().mockResolvedValue(ACCOUNT_A) })
  const app = createApplication(adapter)
  const a: string[] = []
  const b: string[] = []
  app.onWalletStateChanged(s => a.push(s.status))
  app.onWalletStateChanged(s => b.push(s.status))

  await app.connect()

  expect(a).toContain('connected')
  expect(b).toContain('connected')
})

// ---------------------------------------------------------------------------
// Recoverable non-rejection errors
// ---------------------------------------------------------------------------

test('a generic wallet error produces wallet-connect-error state', async () => {
  const adapter = makeAdapter({
    connect: vi.fn().mockRejectedValue(new WalletConnectError('RPC timeout')),
  })
  const app = createApplication(adapter)
  await app.connect()

  const state = app.readWalletAccount()
  expect(state.status).toBe('error')
  if (state.status === 'error') {
    expect(state.error.kind).toBe('wallet-connect-error')
    expect(state.error.message).toContain('RPC timeout')
  }
})
