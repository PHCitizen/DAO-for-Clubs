/**
 * Behavioral tests for wallet connection and network validation — issues 01.02 & 01.03.
 *
 * All tests go through createApplication() with controlled WalletAdapter and
 * RpcAdapter stubs. No React hooks, no DOM, no browser APIs are involved.
 *
 * Real-wallet smoke check
 * -----------------------
 * To verify against an actual wallet extension (e.g. MetaMask):
 *   1. `pnpm dev`
 *   2. Open http://localhost:3000 in a browser with the extension installed.
 *   3. Click "Connect wallet" — confirm the extension prompt appears.
 *   4. Approve the connection — confirm the address and network appear in the UI.
 *   5. In the extension, switch to a different network (e.g. Ethereum Mainnet) —
 *      confirm the UI displays a "Wrong network" alert explaining the mismatch and
 *      offers a button to switch to the supported chain.
 *   6. Click "Switch to BNB Smart Chain Testnet" (or configured chain):
 *      - Click "Reject" in the extension — confirm UI displays rejection alert with "Try again".
 *      - Click "Try again" and approve in the extension — confirm UI updates to matched.
 *   7. Switch accounts in the extension — confirm the UI updates immediately.
 *   8. Disconnect in the extension — confirm the UI returns to disconnected state.
 *   9. Click "Connect wallet" again — confirm reconnect works without reload.
 */

import { expect, test, vi } from 'vitest'
import { getAddress, type Hex } from 'viem'
import { createApplication } from './application'
import type { ContractReadRequest } from './treasury'
import type { TestUsdTransactionLog } from './testusd'
import {
  type WalletAdapter,
  type ContractWriteRequest,
  type AccountChangedListener,
  type ChainChangedListener,
  WalletRejectedError,
  WalletUnavailableError,
  WalletConnectError,
  NetworkSwitchRejectedError,
  NetworkSwitchError,
  TransactionRejectedError,
} from './wallet'
import {
  type RpcAdapter,
  WalletNotConnectedError,
  DeploymentNotDeployedError,
  DeploymentNotConfiguredError,
  ChainMismatchError,
  StaleActionConfigurationError,
  RpcUnavailableError,
} from './rpc'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type ControlledAdapter = WalletAdapter & {
  /** Simulate the wallet firing an accountsChanged event. */
  simulateAccountChange(account: `0x${string}` | null): void
  /** Simulate the wallet firing a chainChanged event. */
  simulateChainChange(chainId: number): void
}

function makeAdapter(overrides?: Partial<WalletAdapter>): ControlledAdapter {
  let accountChangeListener: AccountChangedListener | null = null
  let chainChangeListener: ChainChangedListener | null = null

  const defaults: WalletAdapter = {
    isAvailable: () => true,
    connect: vi.fn().mockResolvedValue('0xABCDEF0123456789ABCDEF0123456789ABCDEF01' as `0x${string}`),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getAccount: vi.fn().mockResolvedValue(null),
    getChainId: vi.fn().mockResolvedValue(31337),
    onAccountChanged(listener) {
      accountChangeListener = listener
      return () => { accountChangeListener = null }
    },
    onChainChanged(listener) {
      chainChangeListener = listener
      return () => { chainChangeListener = null }
    },
    switchChain: vi.fn().mockResolvedValue(undefined),
    sendTransaction: vi.fn().mockResolvedValue(`0x${'00'.repeat(32)}`),
  }

  return Object.assign({}, defaults, overrides, {
    simulateAccountChange(account: `0x${string}` | null) {
      accountChangeListener?.({ account })
    },
    simulateChainChange(chainId: number) {
      chainChangeListener?.({ chainId })
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
// Deployment and network context — issue 01.03
// ---------------------------------------------------------------------------

test('displays configured deployment context with default local development chain', () => {
  const application = createApplication()
  const deployment = application.readDeployment()
  expect(deployment.chainId).toBe(31337)
  expect(deployment.chainName).toBe('Local Development')
  expect(deployment.isSupported).toBe(true)
  expect(deployment.daoAddress).toBeNull()
  expect(deployment.isDeployed).toBe(false)
})

test('supports configuring BNB Smart Chain testnet deployment context', () => {
  const application = createApplication(undefined, undefined, {
    chainId: 97,
    daoAddress: '0x1234567890123456789012345678901234567890' as `0x${string}`,
  })
  const deployment = application.readDeployment()
  expect(deployment.chainId).toBe(97)
  expect(deployment.chainName).toBe('BNB Smart Chain Testnet')
  expect(deployment.isSupported).toBe(true)
  expect(deployment.daoAddress).toBe('0x1234567890123456789012345678901234567890')
  expect(deployment.isDeployed).toBe(true)
})

test('treats chain ID and canonical DAO address as deployment identity and accommodates not-yet-deployed DAO', () => {
  const application = createApplication(undefined, undefined, {
    chainId: 97,
    daoAddress: null,
  })
  const deployment = application.readDeployment()
  expect(deployment.chainId).toBe(97)
  expect(deployment.daoAddress).toBeNull()
  expect(deployment.isDeployed).toBe(false)
})

// ---------------------------------------------------------------------------
// Network state tracking and mismatch detection — issue 01.03
// ---------------------------------------------------------------------------

test('network state starts as disconnected with configured chain context', () => {
  const application = createApplication(undefined, undefined, { chainId: 97 })
  expect(application.readNetworkState()).toEqual({
    status: 'disconnected',
    configuredChainId: 97,
    configuredChainName: 'BNB Smart Chain Testnet',
    isSupported: true,
  })
})

test('detects matched network when connected to the configured chain', async () => {
  const adapter = makeAdapter({
    getChainId: vi.fn().mockResolvedValue(97),
  })
  const application = createApplication(adapter, undefined, { chainId: 97 })
  await application.connect()

  expect(application.readNetworkState()).toEqual({
    status: 'matched',
    configuredChainId: 97,
    configuredChainName: 'BNB Smart Chain Testnet',
    walletChainId: 97,
  })
})

test('detects mismatched network when wallet is on another chain', async () => {
  const adapter = makeAdapter({
    getChainId: vi.fn().mockResolvedValue(1), // Ethereum Mainnet
  })
  const application = createApplication(adapter, undefined, { chainId: 97 })
  await application.connect()

  const networkState = application.readNetworkState()
  expect(networkState.status).toBe('mismatched')
  if (networkState.status === 'mismatched') {
    expect(networkState.configuredChainId).toBe(97)
    expect(networkState.walletChainId).toBe(1)
    expect(networkState.canSwitch).toBe(true)
  }
})

test('notifies listeners when wallet changes network via chainChanged event', async () => {
  const adapter = makeAdapter({
    getChainId: vi.fn().mockResolvedValue(97),
  })
  const application = createApplication(adapter, undefined, { chainId: 97 })
  await application.connect()

  expect(application.readNetworkState().status).toBe('matched')

  const networkListener = vi.fn()
  application.onNetworkStateChanged(networkListener)

  // Wallet switches to chain 1
  adapter.simulateChainChange(1)

  expect(application.readNetworkState()).toEqual({
    status: 'mismatched',
    configuredChainId: 97,
    configuredChainName: 'BNB Smart Chain Testnet',
    walletChainId: 1,
    walletChainName: 'Unsupported Chain (1)',
    canSwitch: true,
  })
  expect(networkListener).toHaveBeenCalledWith(expect.objectContaining({
    status: 'mismatched',
    walletChainId: 1,
  }))

  // Wallet switches back to 97
  adapter.simulateChainChange(97)
  expect(application.readNetworkState().status).toBe('matched')
})

test('clears network state to disconnected when wallet disconnects', async () => {
  const adapter = makeAdapter({
    getChainId: vi.fn().mockResolvedValue(97),
  })
  const application = createApplication(adapter, undefined, { chainId: 97 })
  await application.connect()
  expect(application.readNetworkState().status).toBe('matched')

  await application.disconnect()
  expect(application.readNetworkState()).toEqual({
    status: 'disconnected',
    configuredChainId: 97,
    configuredChainName: 'BNB Smart Chain Testnet',
    isSupported: true,
  })
})

// ---------------------------------------------------------------------------
// Network switching and retry feedback — issue 01.03
// ---------------------------------------------------------------------------

test('switchNetwork triggers wallet adapter switchChain and transitions to matched on success', async () => {
  let simulatedChain = 1
  const adapter = makeAdapter({
    getChainId: vi.fn().mockImplementation(async () => simulatedChain),
    switchChain: vi.fn().mockImplementation(async (targetChainId: number) => {
      simulatedChain = targetChainId
      adapter.simulateChainChange(targetChainId)
    }),
  })
  const application = createApplication(adapter, undefined, { chainId: 97 })
  await application.connect()
  expect(application.readNetworkState().status).toBe('mismatched')

  await application.switchNetwork()

  expect(adapter.switchChain).toHaveBeenCalledWith(97)
  expect(application.readNetworkState()).toEqual({
    status: 'matched',
    configuredChainId: 97,
    configuredChainName: 'BNB Smart Chain Testnet',
    walletChainId: 97,
  })
})

test('switchNetwork user rejection transitions to switch-error and allows retry without reload', async () => {
  let shouldReject = true
  let simulatedChain = 1
  const adapter = makeAdapter({
    getChainId: vi.fn().mockImplementation(async () => simulatedChain),
    switchChain: vi.fn().mockImplementation(async (targetChainId: number) => {
      if (shouldReject) {
        throw new NetworkSwitchRejectedError()
      }
      simulatedChain = targetChainId
      adapter.simulateChainChange(targetChainId)
    }),
  })
  const application = createApplication(adapter, undefined, { chainId: 97 })
  await application.connect()
  expect(application.readNetworkState().status).toBe('mismatched')

  // First attempt rejected by user
  await application.switchNetwork()

  const errorState = application.readNetworkState()
  expect(errorState.status).toBe('switch-error')
  if (errorState.status === 'switch-error') {
    expect(errorState.configuredChainId).toBe(97)
    expect(errorState.walletChainId).toBe(1)
    expect(errorState.error.kind).toBe('network-switch-rejected')
  }

  // Second attempt (retry) succeeds without page reload
  shouldReject = false
  await application.switchNetwork()

  expect(application.readNetworkState()).toEqual({
    status: 'matched',
    configuredChainId: 97,
    configuredChainName: 'BNB Smart Chain Testnet',
    walletChainId: 97,
  })
})

test('switchNetwork with general switch error surfaces error and allows retry', async () => {
  const adapter = makeAdapter({
    getChainId: vi.fn().mockResolvedValue(1),
    switchChain: vi.fn().mockRejectedValue(new NetworkSwitchError('Failed to switch RPC endpoint')),
  })
  const application = createApplication(adapter, undefined, { chainId: 97 })
  await application.connect()
  expect(application.readNetworkState().status).toBe('mismatched')

  await application.switchNetwork()

  const errorState = application.readNetworkState()
  expect(errorState.status).toBe('switch-error')
  if (errorState.status === 'switch-error') {
    expect(errorState.error.kind).toBe('network-switch-error')
    expect(errorState.error.message).toContain('Failed to switch RPC endpoint')
  }
})

// ---------------------------------------------------------------------------
// Action preparation and staleness prevention — issue 01.03
// ---------------------------------------------------------------------------

test('action preparation fails when wallet is not connected', async () => {
  const application = createApplication(undefined, undefined, {
    chainId: 97,
    daoAddress: '0x1234567890123456789012345678901234567890' as `0x${string}`,
  })
  await expect(application.prepareDeploymentAction()).rejects.toThrow(WalletNotConnectedError)
})

test('action preparation fails when DAO is not deployed on the configured chain', async () => {
  const adapter = makeAdapter({ getChainId: vi.fn().mockResolvedValue(97) })
  const application = createApplication(adapter, undefined, {
    chainId: 97,
    daoAddress: null,
  })
  await application.connect()

  await expect(application.prepareDeploymentAction()).rejects.toThrow(DeploymentNotDeployedError)
})

test('action preparation fails when wallet chain does not match deployment chain', async () => {
  const adapter = makeAdapter({ getChainId: vi.fn().mockResolvedValue(1) }) // Chain 1
  const application = createApplication(adapter, undefined, {
    chainId: 97,
    daoAddress: '0x1234567890123456789012345678901234567890' as `0x${string}`,
  })
  await application.connect()

  await expect(application.prepareDeploymentAction()).rejects.toThrow(ChainMismatchError)
})

test('action preparation succeeds with valid deployment context when connected to correct chain', async () => {
  const adapter = makeAdapter({
    getChainId: vi.fn().mockResolvedValue(97),
    connect: vi.fn().mockResolvedValue(ACCOUNT_A),
  })
  const application = createApplication(adapter, undefined, {
    chainId: 97,
    daoAddress: '0x1234567890123456789012345678901234567890' as `0x${string}`,
  })
  await application.connect()

  const prepared = await application.prepareDeploymentAction()
  expect(prepared.context).toEqual({
    account: ACCOUNT_A,
    chainId: 97,
    targetAddress: '0x1234567890123456789012345678901234567890',
  })
  expect(() => prepared.assertValid()).not.toThrow()
})

test('action preparation rejects with StaleActionConfigurationError if wallet chain changes during preparation', async () => {
  const adapter = makeAdapter({
    getChainId: vi.fn().mockResolvedValue(97),
    connect: vi.fn().mockResolvedValue(ACCOUNT_A),
  })
  const application = createApplication(adapter, undefined, {
    chainId: 97,
    daoAddress: '0x1234567890123456789012345678901234567890' as `0x${string}`,
  })
  await application.connect()

  // Simulate wallet chain changing during async preparation step
  await expect(
    application.prepareDeploymentAction({
      verify: async () => {
        adapter.simulateChainChange(1) // Chain switched mid-prep!
      },
    })
  ).rejects.toThrow(StaleActionConfigurationError)
})

test('action preparation rejects with StaleActionConfigurationError if wallet account changes during preparation', async () => {
  const adapter = makeAdapter({
    getChainId: vi.fn().mockResolvedValue(97),
    connect: vi.fn().mockResolvedValue(ACCOUNT_A),
  })
  const application = createApplication(adapter, undefined, {
    chainId: 97,
    daoAddress: '0x1234567890123456789012345678901234567890' as `0x${string}`,
  })
  await application.connect()

  // Simulate wallet account changing during async preparation step
  await expect(
    application.prepareDeploymentAction({
      verify: async () => {
        adapter.simulateAccountChange(ACCOUNT_B) // Account switched mid-prep!
      },
    })
  ).rejects.toThrow(StaleActionConfigurationError)
})

test('prepared action execute rejects with StaleActionConfigurationError if chain or account changes before execution', async () => {
  const adapter = makeAdapter({
    getChainId: vi.fn().mockResolvedValue(97),
    connect: vi.fn().mockResolvedValue(ACCOUNT_A),
  })
  const application = createApplication(adapter, undefined, {
    chainId: 97,
    daoAddress: '0x1234567890123456789012345678901234567890' as `0x${string}`,
  })
  await application.connect()

  const prepared = await application.prepareDeploymentAction()

  // User changes account after prepare but before execute
  adapter.simulateAccountChange(ACCOUNT_B)

  await expect(
    prepared.execute(async (ctx) => {
      return `executed for ${ctx.account}`
    })
  ).rejects.toThrow(StaleActionConfigurationError)
})

// ---------------------------------------------------------------------------
// Public reads without wallet and RPC error distinction — issue 01.03
// ---------------------------------------------------------------------------

test('queryPublicDeployment succeeds without wallet connection when RPC is available', async () => {
  const rpcAdapter: RpcAdapter = {
    getChainId: vi.fn().mockResolvedValue(97),
    getBlockNumber: vi.fn().mockResolvedValue(1000n),
  }
  const application = createApplication(undefined, rpcAdapter, {
    chainId: 97,
    daoAddress: '0x1234567890123456789012345678901234567890' as `0x${string}`,
  })

  const result = await application.queryPublicDeployment()
  expect(result).toEqual({
    status: 'available',
    chainId: 97,
    blockNumber: 1000n,
    daoAddress: '0x1234567890123456789012345678901234567890',
    isDeployed: true,
  })
})

test('queryPublicDeployment returns unconfigured when no RPC adapter or URL is configured', async () => {
  const application = createApplication(undefined, undefined, {
    chainId: 999999, // Unknown chain with no RPC URL
    rpcUrl: undefined,
  })

  const result = await application.queryPublicDeployment()
  expect(result.status).toBe('unconfigured')
})

test('queryPublicDeployment returns rpc-unavailable when RPC fails', async () => {
  const rpcAdapter: RpcAdapter = {
    getChainId: vi.fn().mockRejectedValue(new RpcUnavailableError('Network connection refused')),
    getBlockNumber: vi.fn().mockRejectedValue(new RpcUnavailableError('Network connection refused')),
  }
  const application = createApplication(undefined, rpcAdapter, { chainId: 97 })

  const result = await application.queryPublicDeployment()
  expect(result.status).toBe('rpc-unavailable')
  if (result.status === 'rpc-unavailable') {
    expect(result.error).toContain('Network connection refused')
  }
})

test('queryPublicData returns success with empty result when query yields empty array', async () => {
  const rpcAdapter: RpcAdapter = {
    getChainId: vi.fn().mockResolvedValue(97),
    getBlockNumber: vi.fn().mockResolvedValue(1000n),
  }
  const application = createApplication(undefined, rpcAdapter, { chainId: 97 })

  const result = await application.queryPublicData(async () => {
    return [] // Empty list of items returned by contract
  })

  expect(result).toEqual({
    status: 'success',
    data: [],
    chainId: 97,
  })
})

test('queryPublicData distinguishes RPC failure from an empty successful result', async () => {
  const rpcAdapter: RpcAdapter = {
    getChainId: vi.fn().mockResolvedValue(97),
    getBlockNumber: vi.fn().mockResolvedValue(1000n),
  }
  const application = createApplication(undefined, rpcAdapter, { chainId: 97 })

  // When RPC fails (e.g. timeout / connection failure)
  const failedResult = await application.queryPublicData(async () => {
    throw new RpcUnavailableError('504 Gateway Timeout')
  })

  expect(failedResult.status).toBe('rpc-unavailable')
  if (failedResult.status === 'rpc-unavailable') {
    expect(failedResult.error).toContain('504 Gateway Timeout')
  }
  // It is NOT mistaken for an empty success result
  expect(failedResult.status).not.toBe('success')
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

// ---------------------------------------------------------------------------
// Treasury discovery and inspection — issue 02.02
// ---------------------------------------------------------------------------

const TREASURY_A = '0x00000000000000000000000000000000000000a1' as const
const TREASURY_B = '0x00000000000000000000000000000000000000b2' as const
const SHARED_TEST_USD = '0x00000000000000000000000000000000000000c3' as const
const ADMIN_A = '0x00000000000000000000000000000000000000d4' as const
const ADMIN_B = '0x00000000000000000000000000000000000000e5' as const

const TREASURY_DEPLOYMENT = {
  chainId: 31337,
  daoAddress: TREASURY_A,
  testUsdAddress: SHARED_TEST_USD,
} as const

interface TreasuryRpcState {
  chainId: number
  treasuries: string[]
  administrators: Record<string, string>
  fundingAsset: string
  symbol: string
  decimals: number
  balances: Record<string, bigint>
  failure: Error | null
}

function key(address: string): string {
  return address.toLowerCase()
}

function makeTreasuryState(overrides: Partial<TreasuryRpcState> = {}): TreasuryRpcState {
  return {
    chainId: 31337,
    treasuries: [],
    administrators: {},
    fundingAsset: SHARED_TEST_USD,
    symbol: 'TUSD',
    decimals: 18,
    balances: {},
    failure: null,
    ...overrides,
  }
}

type TreasuryRpc = RpcAdapter & { readContract: ReturnType<typeof vi.fn> }

function makeTreasuryRpc(state: TreasuryRpcState): TreasuryRpc {
  const readContract = vi.fn(async (request: ContractReadRequest): Promise<unknown> => {
    if (state.failure) throw state.failure
    const args = request.args ?? []
    switch (request.functionName) {
      case 'getTreasuries':
        return state.treasuries
      case 'isTreasury':
        return state.treasuries.some((address) => key(address) === key(args[0] as string))
      case 'administrator':
        return state.administrators[key(request.address)]
      case 'fundingAsset':
        return state.fundingAsset
      case 'symbol':
        return state.symbol
      case 'decimals':
        return state.decimals
      case 'balanceOf':
        return state.balances[key(args[0] as string)] ?? 0n
      default:
        throw new Error(`Unexpected read: ${request.functionName}`)
    }
  })

  return {
    getChainId: vi.fn(async () => state.chainId),
    getBlockNumber: vi.fn(async () => 1n),
    readContract,
  } as TreasuryRpc
}

test('a wallet-free visitor sees an empty treasury registry as a successful result', async () => {
  const rpc = makeTreasuryRpc(makeTreasuryState())
  const app = createApplication(undefined, rpc, TREASURY_DEPLOYMENT)

  const result = await app.listTreasuries()

  expect(result).toEqual({ status: 'success', chainId: 31337, treasuries: [] })
  expect(app.readWalletAccount()).toEqual({ status: 'disconnected' })
})

test('treasury discovery ignores wallet account and wallet network state', async () => {
  const adapter = makeAdapter({
    connect: vi.fn().mockResolvedValue(ACCOUNT_A),
    getChainId: vi.fn().mockResolvedValue(1),
  })
  const rpc = makeTreasuryRpc(makeTreasuryState({ treasuries: [TREASURY_A] }))
  const app = createApplication(adapter, rpc, TREASURY_DEPLOYMENT)
  await app.connect()

  const result = await app.listTreasuries()

  expect(result.status).toBe('success')
  if (result.status === 'success') {
    expect(result.treasuries.map((item) => item.address)).toEqual([getAddress(TREASURY_A)])
  }
  // The read did not depend on the mismatched wallet chain.
  expect(app.readNetworkState().status).toBe('mismatched')
})

test('discovers multiple treasuries by stable identity without duplicating on retry', async () => {
  const rpc = makeTreasuryRpc(
    makeTreasuryState({
      treasuries: [TREASURY_A, TREASURY_B, TREASURY_A],
    })
  )
  const app = createApplication(undefined, rpc, TREASURY_DEPLOYMENT)

  const first = await app.listTreasuries()
  const second = await app.listTreasuries()

  expect(first.status).toBe('success')
  expect(second).toEqual(first)
  if (first.status === 'success') {
    expect(first.treasuries.map((item) => item.address)).toEqual([
      getAddress(TREASURY_A),
      getAddress(TREASURY_B),
    ])
  }
})

test('inspects a registered treasury with its administrator, shared TestUSD identity, and zero balance', async () => {
  const rpc = makeTreasuryRpc(
    makeTreasuryState({
      treasuries: [TREASURY_A],
      administrators: { [key(TREASURY_A)]: ADMIN_A },
    })
  )
  const app = createApplication(undefined, rpc, TREASURY_DEPLOYMENT)

  const result = await app.readTreasury(TREASURY_A.toLowerCase())

  expect(result.status).toBe('success')
  if (result.status === 'success') {
    expect(result.chainId).toBe(31337)
    expect(result.treasury.address).toBe(getAddress(TREASURY_A))
    expect(result.treasury.administrator).toBe(getAddress(ADMIN_A))
    expect(result.treasury.fundingAsset).toBe(getAddress(SHARED_TEST_USD))
    expect(result.treasury.isSharedFundingAsset).toBe(true)
    expect(result.treasury.fundingAssetSymbol).toBe('TUSD')
    expect(result.treasury.fundingAssetDecimals).toBe(18)
    expect(result.treasury.balance).toBe(0n)
    expect(result.treasury.formattedBalance).toBe('0')
  }
})

test('formats the current balance with the funding asset decimals', async () => {
  const rpc = makeTreasuryRpc(
    makeTreasuryState({
      treasuries: [TREASURY_A],
      administrators: { [key(TREASURY_A)]: ADMIN_A },
      balances: { [key(TREASURY_A)]: 12_345_600_000_000_000_000n },
    })
  )
  const app = createApplication(undefined, rpc, TREASURY_DEPLOYMENT)

  const result = await app.readTreasury(TREASURY_A)

  expect(result.status).toBe('success')
  if (result.status === 'success') {
    expect(result.treasury.balance).toBe(12_345_600_000_000_000_000n)
    expect(result.treasury.formattedBalance).toBe('12.3456')
  }
})

test('different treasuries keep independent administrators and balances', async () => {
  const rpc = makeTreasuryRpc(
    makeTreasuryState({
      treasuries: [TREASURY_A, TREASURY_B],
      administrators: {
        [key(TREASURY_A)]: ADMIN_A,
        [key(TREASURY_B)]: ADMIN_B,
      },
      balances: {
        [key(TREASURY_A)]: 1_000_000_000_000_000_000n,
        [key(TREASURY_B)]: 5_000_000_000_000_000_000n,
      },
    })
  )
  const app = createApplication(undefined, rpc, TREASURY_DEPLOYMENT)

  const a = await app.readTreasury(TREASURY_A)
  const b = await app.readTreasury(TREASURY_B)

  expect(a.status).toBe('success')
  expect(b.status).toBe('success')
  if (a.status === 'success' && b.status === 'success') {
    expect(a.treasury.address).toBe(getAddress(TREASURY_A))
    expect(a.treasury.administrator).toBe(getAddress(ADMIN_A))
    expect(a.treasury.formattedBalance).toBe('1')
    expect(b.treasury.address).toBe(getAddress(TREASURY_B))
    expect(b.treasury.administrator).toBe(getAddress(ADMIN_B))
    expect(b.treasury.formattedBalance).toBe('5')
  }
})

test('refresh reads reflect a confirmed external deposit', async () => {
  const state = makeTreasuryState({
    treasuries: [TREASURY_A],
    administrators: { [key(TREASURY_A)]: ADMIN_A },
  })
  const rpc = makeTreasuryRpc(state)
  const app = createApplication(undefined, rpc, TREASURY_DEPLOYMENT)

  const before = await app.readTreasury(TREASURY_A)
  state.balances[key(TREASURY_A)] = 7_500_000_000_000_000_000n
  const after = await app.readTreasury(TREASURY_A)

  expect(before.status).toBe('success')
  expect(after.status).toBe('success')
  if (before.status === 'success' && after.status === 'success') {
    expect(before.treasury.formattedBalance).toBe('0')
    expect(after.treasury.formattedBalance).toBe('7.5')
  }
})

test('distinguishes an unregistered or malformed treasury from an RPC failure', async () => {
  const rpc = makeTreasuryRpc(makeTreasuryState({ treasuries: [TREASURY_A] }))
  const app = createApplication(undefined, rpc, TREASURY_DEPLOYMENT)

  const unregistered = await app.readTreasury(TREASURY_B)
  const malformed = await app.readTreasury('not-an-address')

  expect(unregistered).toEqual({
    status: 'not-found',
    address: TREASURY_B,
    reason: 'unregistered',
  })
  expect(malformed).toEqual({
    status: 'not-found',
    address: 'not-an-address',
    reason: 'invalid-address',
  })
})

test('reports an RPC failure distinctly and recovers on retry without duplicating treasuries', async () => {
  const state = makeTreasuryState({ treasuries: [TREASURY_A, TREASURY_B] })
  const rpc = makeTreasuryRpc(state)
  const app = createApplication(undefined, rpc, TREASURY_DEPLOYMENT)

  state.failure = new Error('connect ECONNREFUSED')
  const failure = await app.listTreasuries()
  expect(failure.status).toBe('rpc-unavailable')
  if (failure.status === 'rpc-unavailable') {
    expect(failure.error).toContain('ECONNREFUSED')
  }

  state.failure = null
  const retry = await app.listTreasuries()
  expect(retry.status).toBe('success')
  if (retry.status === 'success') {
    expect(retry.treasuries).toHaveLength(2)
  }
})

test('reports a deployment chain mismatch instead of mixing another chain state', async () => {
  const rpc = makeTreasuryRpc(makeTreasuryState({ chainId: 1, treasuries: [TREASURY_A] }))
  const app = createApplication(undefined, rpc, TREASURY_DEPLOYMENT)

  const result = await app.listTreasuries()

  expect(result).toEqual({
    status: 'chain-mismatch',
    expectedChainId: 31337,
    actualChainId: 1,
  })
})

test('treasury reads are unconfigured without a deployment or RPC seam', async () => {
  const app = createApplication(undefined, undefined, {
    chainId: 999999,
    daoAddress: null,
    rpcUrl: undefined,
  })

  expect((await app.listTreasuries()).status).toBe('unconfigured')
  expect((await app.readTreasury(TREASURY_A)).status).toBe('unconfigured')
})

// ---------------------------------------------------------------------------
// TestUSD minting — issue 02.03
// ---------------------------------------------------------------------------

const CURRENCY_ADMIN = '0x00000000000000000000000000000000000000f6' as const
const MINT_RECIPIENT = '0x00000000000000000000000000000000000000a7' as const
const MINT_HASH = `0x${'ab'.repeat(32)}` as const
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const

const TEST_USD_DEPLOYMENT = {
  chainId: 31337,
  testUsdAddress: SHARED_TEST_USD,
} as const

type MintOutcome =
  | 'success'
  | 'reject'
  | 'submit-error'
  | 'revert'
  | 'confirmation-error'
  | 'balance-read-error'

interface MintHarnessState {
  chainId: number
  connectedAccount: `0x${string}`
  symbol: string
  decimals: number
  currencyAdmin: `0x${string}`
  balances: Record<string, bigint>
  outcome: MintOutcome
  mintedAmount: bigint | null
  sent: Array<{
    from: `0x${string}`
    to: `0x${string}`
    functionName: string
    args: readonly unknown[]
  }>
}

function transferLog(recipient: string, amount: bigint): TestUsdTransactionLog {
  return {
    address: SHARED_TEST_USD,
    data: `0x${amount.toString(16).padStart(64, '0')}` as Hex,
    topics: [
      TRANSFER_TOPIC,
      `0x${'0'.repeat(64)}`,
      `0x${recipient.slice(2).toLowerCase().padStart(64, '0')}`,
    ],
  }
}

function makeMintHarness(overrides: Partial<MintHarnessState> = {}) {
  const state: MintHarnessState = {
    chainId: 31337,
    connectedAccount: CURRENCY_ADMIN,
    symbol: 'TUSD',
    decimals: 18,
    currencyAdmin: CURRENCY_ADMIN,
    balances: {},
    outcome: 'success',
    mintedAmount: null,
    sent: [],
    ...overrides,
  }

  const rpc = {
    getChainId: vi.fn(async () => state.chainId),
    getBlockNumber: vi.fn(async () => 1n),
    readContract: vi.fn(async (request: ContractReadRequest): Promise<unknown> => {
      switch (request.functionName) {
        case 'symbol':
          return state.symbol
        case 'decimals':
          return state.decimals
        case 'currencyAdmin':
          return state.currencyAdmin
        case 'balanceOf': {
          if (state.outcome === 'balance-read-error') {
            throw new Error('balance read unavailable')
          }
          return state.balances[key(request.args?.[0] as string)] ?? 0n
        }
        default:
          throw new Error(`Unexpected TestUSD read: ${request.functionName}`)
      }
    }),
    waitForTransactionReceipt: vi.fn(async (hash: Hex) => {
      if (state.outcome === 'confirmation-error') {
        throw new Error('receipt unavailable')
      }
      const last = state.sent[state.sent.length - 1]
      if (!last) throw new Error(`Unknown transaction ${hash}`)

      const recipient = getAddress(last.args[0] as string)
      const requested = last.args[1] as bigint
      if (state.outcome === 'revert') {
        return { status: 'reverted', blockNumber: 123n, logs: [] }
      }

      const minted = state.mintedAmount ?? requested
      state.balances[key(recipient)] = (state.balances[key(recipient)] ?? 0n) + minted
      return {
        status: 'success',
        blockNumber: 123n,
        logs: [transferLog(recipient, minted)],
      }
    }),
  } as unknown as RpcAdapter

  const adapter = makeAdapter({
    connect: vi.fn().mockResolvedValue(state.connectedAccount),
    getChainId: vi.fn().mockResolvedValue(state.chainId),
    sendTransaction: vi.fn(async (request: ContractWriteRequest) => {
      if (state.outcome === 'reject') throw new TransactionRejectedError()
      if (state.outcome === 'submit-error') throw new Error('nonce too low')
      state.sent.push({
        from: request.from,
        to: request.to,
        functionName: request.functionName,
        args: request.args ?? [],
      })
      return MINT_HASH
    }),
  })

  return { state, rpc, adapter }
}

test('reads shared TestUSD metadata without a wallet', async () => {
  const { rpc } = makeMintHarness()
  const app = createApplication(undefined, rpc, TEST_USD_DEPLOYMENT)

  const result = await app.readTestUsd()

  expect(result.status).toBe('success')
  if (result.status === 'success') {
    expect(result.chainId).toBe(31337)
    expect(result.testUsd.address).toBe(getAddress(SHARED_TEST_USD))
    expect(result.testUsd.symbol).toBe('TUSD')
    expect(result.testUsd.decimals).toBe(18)
    expect(result.testUsd.currencyAdmin).toBe(getAddress(CURRENCY_ADMIN))
  }
  expect(app.readWalletAccount()).toEqual({ status: 'disconnected' })
})

test('rejects invalid mint amounts using the token decimals before sending', async () => {
  const { rpc, adapter } = makeMintHarness()
  const app = createApplication(adapter, rpc, TEST_USD_DEPLOYMENT)
  await app.connect()

  for (const amount of ['0', '0.0000000000000000001', '1.0000000000000000001', '1e3', 'abc', '']) {
    const result = await app.mintTestUsd({ recipient: MINT_RECIPIENT, amount })
    expect(result.status).toBe('invalid-amount')
  }

  expect(adapter.sendTransaction).not.toHaveBeenCalled()
})

test('rejects an invalid mint recipient before sending', async () => {
  const { rpc, adapter } = makeMintHarness()
  const app = createApplication(adapter, rpc, TEST_USD_DEPLOYMENT)
  await app.connect()

  const result = await app.mintTestUsd({ recipient: 'not-an-address', amount: '1' })

  expect(result).toEqual({
    status: 'invalid-recipient',
    message: 'Enter a valid recipient address.',
  })
  expect(adapter.sendTransaction).not.toHaveBeenCalled()
})

test('rejects a treasury administrator who is not the TestUSD currency administrator', async () => {
  const { rpc, adapter } = makeMintHarness({ connectedAccount: ADMIN_A })
  const app = createApplication(adapter, rpc, TEST_USD_DEPLOYMENT)
  await app.connect()

  const result = await app.mintTestUsd({ recipient: MINT_RECIPIENT, amount: '1' })

  expect(result.status).toBe('unauthorized')
  if (result.status === 'unauthorized') {
    expect(result.account).toBe(getAddress(ADMIN_A))
    expect(result.currencyAdmin).toBe(getAddress(CURRENCY_ADMIN))
  }
  expect(adapter.sendTransaction).not.toHaveBeenCalled()
})

test('an authorized mint reports the decoded amount and updated recipient balance', async () => {
  const { state, rpc, adapter } = makeMintHarness({
    balances: { [key(MINT_RECIPIENT)]: 2_000_000_000_000_000_000n },
  })
  const app = createApplication(adapter, rpc, TEST_USD_DEPLOYMENT)
  await app.connect()

  const result = await app.mintTestUsd({ recipient: MINT_RECIPIENT, amount: '1.5' })

  expect(result.status).toBe('success')
  if (result.status === 'success') {
    expect(result.chainId).toBe(31337)
    expect(result.hash).toBe(MINT_HASH)
    expect(result.blockNumber).toBe(123n)
    expect(result.recipient).toBe(getAddress(MINT_RECIPIENT))
    expect(result.amount).toBe(1_500_000_000_000_000_000n)
    expect(result.formattedAmount).toBe('1.5')
    expect(result.recipientBalance).toBe(3_500_000_000_000_000_000n)
    expect(result.formattedRecipientBalance).toBe('3.5')
    expect(result.symbol).toBe('TUSD')
    expect(result.decimals).toBe(18)
    expect(result.currencyAdmin).toBe(getAddress(CURRENCY_ADMIN))
  }

  expect(adapter.sendTransaction).toHaveBeenCalledOnce()
  expect(adapter.sendTransaction).toHaveBeenCalledWith({
    from: getAddress(CURRENCY_ADMIN),
    to: getAddress(SHARED_TEST_USD),
    abi: expect.any(Array),
    functionName: 'mint',
    args: [getAddress(MINT_RECIPIENT), 1_500_000_000_000_000_000n],
  })
  expect(state.sent).toHaveLength(1)
})

test('reports the actual minted amount decoded from the confirmed event', async () => {
  const { rpc, adapter } = makeMintHarness({
    mintedAmount: 1_000_000_000_000_000_000n,
  })
  const app = createApplication(adapter, rpc, TEST_USD_DEPLOYMENT)
  await app.connect()

  const result = await app.mintTestUsd({ recipient: MINT_RECIPIENT, amount: '1.5' })

  expect(result.status).toBe('success')
  if (result.status === 'success') {
    expect(result.amount).toBe(1_000_000_000_000_000_000n)
    expect(result.formattedAmount).toBe('1')
    expect(result.formattedRecipientBalance).toBe('1')
  }
})

test('a wallet-rejected mint is not reported as success', async () => {
  const { state, rpc, adapter } = makeMintHarness({ outcome: 'reject' })
  const app = createApplication(adapter, rpc, TEST_USD_DEPLOYMENT)
  await app.connect()

  const result = await app.mintTestUsd({ recipient: MINT_RECIPIENT, amount: '1' })

  expect(result.status).toBe('wallet-rejected')
  expect(state.sent).toHaveLength(0)
})

test('a submission failure is distinct from confirmed minting', async () => {
  const { rpc, adapter } = makeMintHarness({ outcome: 'submit-error' })
  const app = createApplication(adapter, rpc, TEST_USD_DEPLOYMENT)
  await app.connect()

  const result = await app.mintTestUsd({ recipient: MINT_RECIPIENT, amount: '1' })

  expect(result.status).toBe('transaction-failed')
  if (result.status === 'transaction-failed') {
    expect(result.stage).toBe('submission')
    expect(result.hash).toBeUndefined()
    expect(result.error).toContain('nonce too low')
  }
})

test('a reverted mint is reported as failed with the transaction hash', async () => {
  const { rpc, adapter } = makeMintHarness({ outcome: 'revert' })
  const app = createApplication(adapter, rpc, TEST_USD_DEPLOYMENT)
  await app.connect()

  const result = await app.mintTestUsd({ recipient: MINT_RECIPIENT, amount: '1' })

  expect(result.status).toBe('transaction-failed')
  if (result.status === 'transaction-failed') {
    expect(result.stage).toBe('reverted')
    expect(result.hash).toBe(MINT_HASH)
    expect(result.message).toContain('No currency was minted')
  }
})

test('an unconfirmed mint is distinguished from a confirmed success', async () => {
  const { rpc, adapter } = makeMintHarness({ outcome: 'confirmation-error' })
  const app = createApplication(adapter, rpc, TEST_USD_DEPLOYMENT)
  await app.connect()

  const result = await app.mintTestUsd({ recipient: MINT_RECIPIENT, amount: '1' })

  expect(result.status).toBe('transaction-failed')
  if (result.status === 'transaction-failed') {
    expect(result.stage).toBe('confirmation')
    expect(result.hash).toBe(MINT_HASH)
  }
})

test('a confirmed mint whose balance cannot be read is not reported as success', async () => {
  const { rpc, adapter } = makeMintHarness({ outcome: 'balance-read-error' })
  const app = createApplication(adapter, rpc, TEST_USD_DEPLOYMENT)
  await app.connect()

  const result = await app.mintTestUsd({ recipient: MINT_RECIPIENT, amount: '1' })

  expect(result.status).toBe('transaction-failed')
  if (result.status === 'transaction-failed') {
    expect(result.stage).toBe('confirmation')
    expect(result.message).toContain('balance')
  }
})

test('minting requires a connected wallet', async () => {
  const { rpc } = makeMintHarness()
  const app = createApplication(undefined, rpc, TEST_USD_DEPLOYMENT)

  const result = await app.mintTestUsd({ recipient: MINT_RECIPIENT, amount: '1' })

  expect(result.status).toBe('wallet-unavailable')
})
