import publicArtifacts from './generated/public-artifacts.json' with { type: 'json' }
import { encodeFunctionData, erc20Abi, isAddress, parseAbi, parseUnits, type Hash } from 'viem'
import {
  type WalletAdapter,
  type Address,
  type AccountChangedListener,
  type ChainChangedListener,
  type DomainWalletError,
  WalletUnavailableError,
  NetworkSwitchRejectedError,
  NetworkSwitchError,
  normalizeWalletError,
} from './wallet.js'
import {
  type DeploymentConfig,
  type DeploymentContext,
  getSupportedChain,
  resolveDeploymentContext,
} from './networks.js'
import {
  type RpcAdapter,
  createBrowserRpcAdapter,
  WalletNotConnectedError,
  DeploymentNotDeployedError,
  DeploymentNotConfiguredError,
  ChainMismatchError,
  StaleActionConfigurationError,
} from './rpc.js'

// ---------------------------------------------------------------------------
// Wallet connection and network state
// ---------------------------------------------------------------------------

export type WalletState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected'; account: Address }
  | { status: 'error'; error: DomainWalletError | { kind: string; message: string } }

export type WalletStateListener = (state: WalletState) => void

export type NetworkState =
  | {
      status: 'disconnected'
      configuredChainId: number
      configuredChainName: string
      isSupported: boolean
    }
  | {
      status: 'matched'
      configuredChainId: number
      configuredChainName: string
      walletChainId: number
    }
  | {
      status: 'mismatched'
      configuredChainId: number
      configuredChainName: string
      walletChainId: number
      walletChainName?: string
      canSwitch: boolean
    }
  | {
      status: 'switching'
      configuredChainId: number
      targetChainId: number
    }
  | {
      status: 'switch-error'
      configuredChainId: number
      walletChainId: number
      error: NetworkSwitchRejectedError | NetworkSwitchError
    }

export type NetworkStateListener = (state: NetworkState) => void

// ---------------------------------------------------------------------------
// Action preparation context and interfaces
// ---------------------------------------------------------------------------

export interface ActionContext {
  account: Address
  chainId: number
  targetAddress: Address
}

export interface PrepareActionOptions {
  /** Target contract; defaults to 'dao' */
  target?: 'dao' | 'testUsd' | Address
  /** Optional verification hook executed during preparation to simulate async work */
  verify?: (context: ActionContext) => Promise<void>
}

export interface PreparedAction {
  context: ActionContext
  /** Asserts that wallet connection and chain still match the prepared snapshot */
  assertValid(): void
  /** Executes action only if wallet connection and chain still match */
  execute<T>(actionFn: (context: ActionContext) => Promise<T>): Promise<T>
}

// ---------------------------------------------------------------------------
// Public read status and results
// ---------------------------------------------------------------------------

export type PublicDeploymentStatus =
  | {
      status: 'available'
      chainId: number
      blockNumber: bigint
      daoAddress: Address | null
      isDeployed: boolean
    }
  | {
      status: 'rpc-unavailable'
      message: string
      error: string
    }
  | {
      status: 'unconfigured'
      message: string
    }

export type PublicReadResult<T> =
  | {
      status: 'success'
      data: T
      chainId: number
    }
  | {
      status: 'rpc-unavailable'
      message: string
      error: string
    }
  | {
      status: 'unconfigured'
      message: string
    }

// ---------------------------------------------------------------------------
// Application factory
// ---------------------------------------------------------------------------

/**
 * createApplication returns the public action/read seam used by the UI and
 * behavioral tests. Pass a WalletAdapter to inject a controlled stub in tests
 * or the production browser adapter in the app entry point. When no adapter
 * is supplied the application runs read-only (no wallet actions available).
 */
export type FundingBalances = {
  treasury: Address
  sender: Address
  asset: Address
  decimals: number
  senderBalance: bigint
  treasuryBalance: bigint
}
export type FundingState =
  | { status: 'idle' }
  | { status: 'submitting'; treasury: Address; sender: Address; amount: string }
  | { status: 'pending'; treasury: Address; sender: Address; amount: string; hash: Hash }
  | { status: 'confirmed'; treasury: Address; sender: Address; amount: string; hash: Hash; balances?: FundingBalances; refreshError?: string }
  | { status: 'rejected' | 'failed'; message: string }

const fundingDaoAbi = parseAbi(['function testUsd() view returns (address)', 'function isTreasury(address) view returns (bool)'])
const fundingTreasuryAbi = parseAbi(['function dao() view returns (address)', 'function fundingAsset() view returns (address)'])

export function createApplication(
  adapter?: WalletAdapter,
  injectedRpcAdapter?: RpcAdapter,
  deploymentConfig?: Partial<DeploymentConfig>
) {
  const deploymentContext: DeploymentContext = resolveDeploymentContext(deploymentConfig)

  let rpc = injectedRpcAdapter
  if (!rpc && deploymentContext.rpcUrl) {
    try {
      rpc = createBrowserRpcAdapter(deploymentContext.rpcUrl)
    } catch {
      // Ignored if invalid URL
    }
  }

  // Mutable wallet state kept inside the closure; listeners notify subscribers.
  let walletState: WalletState = { status: 'disconnected' }
  const listeners = new Set<WalletStateListener>()
  let unsubscribeAccountChanged: (() => void) | null = null

  // Mutable network state
  let walletChainId: number | null = null
  const networkListeners = new Set<NetworkStateListener>()
  let unsubscribeChainChanged: (() => void) | null = null

  function deriveNetworkState(): NetworkState {
    if (walletState.status !== 'connected' || walletChainId === null) {
      return {
        status: 'disconnected',
        configuredChainId: deploymentContext.chainId,
        configuredChainName: deploymentContext.chainName,
        isSupported: deploymentContext.isSupported,
      }
    }
    if (walletChainId === deploymentContext.chainId) {
      return {
        status: 'matched',
        configuredChainId: deploymentContext.chainId,
        configuredChainName: deploymentContext.chainName,
        walletChainId,
      }
    }
    const chain = getSupportedChain(walletChainId)
    return {
      status: 'mismatched',
      configuredChainId: deploymentContext.chainId,
      configuredChainName: deploymentContext.chainName,
      walletChainId,
      walletChainName: chain?.name ?? `Unsupported Chain (${walletChainId})`,
      canSwitch: true,
    }
  }

  let networkState: NetworkState = deriveNetworkState()
  let fundingState: FundingState = { status: 'idle' }
  let fundingInProgress = false
  const fundingListeners = new Set<(state: FundingState) => void>()
  function emitFunding(state: FundingState) {
    fundingState = state
    for (const listener of fundingListeners) listener(state)
  }

  async function fundingBalances(treasury: Address, sender: Address): Promise<FundingBalances> {
    const client = rpc?.contractClient
    const dao = deploymentContext.daoAddress
    const asset = deploymentContext.testUsdAddress
    if (!client || !dao || !asset || !deploymentContext.isSupported || !isAddress(treasury)) throw new Error('Funding deployment is unavailable or invalid.')
    if (await client.getChainId() !== deploymentContext.chainId) throw new Error('RPC deployment chain mismatch.')
    const [shared, registered, ownerDao, fundingAsset] = await Promise.all([
      client.readContract({ address: dao, abi: fundingDaoAbi, functionName: 'testUsd' }),
      client.readContract({ address: dao, abi: fundingDaoAbi, functionName: 'isTreasury', args: [treasury] }),
      client.readContract({ address: treasury, abi: fundingTreasuryAbi, functionName: 'dao' }),
      client.readContract({ address: treasury, abi: fundingTreasuryAbi, functionName: 'fundingAsset' }),
    ])
    if (!registered || shared.toLowerCase() !== asset.toLowerCase() || fundingAsset.toLowerCase() !== asset.toLowerCase() || ownerDao.toLowerCase() !== dao.toLowerCase()) throw new Error('Treasury does not belong to the configured deployment.')
    const [decimals, senderBalance, treasuryBalance] = await Promise.all([
      client.readContract({ address: asset, abi: erc20Abi, functionName: 'decimals' }),
      client.readContract({ address: asset, abi: erc20Abi, functionName: 'balanceOf', args: [sender] }),
      client.readContract({ address: asset, abi: erc20Abi, functionName: 'balanceOf', args: [treasury] }),
    ])
    return { treasury, sender, asset, decimals, senderBalance, treasuryBalance }
  }

  function emit(next: WalletState) {
    walletState = next
    for (const l of listeners) l(next)
  }

  function emitNetwork(next: NetworkState) {
    networkState = next
    for (const l of networkListeners) l(next)
  }

  // Wire up the adapter's account-change events once.
  function attachAccountListener() {
    if (!adapter || unsubscribeAccountChanged) return
    const handler: AccountChangedListener = ({ account }) => {
      if (account === null) {
        // Wallet switched to no accounts — treat as disconnect.
        walletChainId = null
        emit({ status: 'disconnected' })
        emitNetwork(deriveNetworkState())
      } else {
        // Account switched; update without re-requesting.
        emit({ status: 'connected', account })
      }
    }
    unsubscribeAccountChanged = adapter.onAccountChanged(handler)
  }

  function detachAccountListener() {
    if (unsubscribeAccountChanged) {
      unsubscribeAccountChanged()
      unsubscribeAccountChanged = null
    }
  }

  function attachChainListener() {
    if (!adapter || unsubscribeChainChanged) return
    const handler: ChainChangedListener = ({ chainId }) => {
      walletChainId = chainId
      emitNetwork(deriveNetworkState())
    }
    unsubscribeChainChanged = adapter.onChainChanged(handler)
  }

  function detachChainListener() {
    if (unsubscribeChainChanged) {
      unsubscribeChainChanged()
      unsubscribeChainChanged = null
    }
  }

  return {
    readFundingState: () => fundingState,
    onFundingStateChanged(listener: (state: FundingState) => void) {
      fundingListeners.add(listener)
      return () => { fundingListeners.delete(listener) }
    },
    async refreshFunding(treasury: Address, sender?: Address) {
      const account = sender ?? (walletState.status === 'connected' ? walletState.account : null)
      if (!account) throw new WalletNotConnectedError()
      return fundingBalances(treasury, account)
    },
    async fundTreasury(treasury: Address, amount: string): Promise<void> {
      if (fundingInProgress) return
      fundingInProgress = true
      try {
        const prepared = await this.prepareDeploymentAction({ target: 'testUsd' })
        const sender = prepared.context.account
        emitFunding({ status: 'submitting', treasury, sender, amount })
        const balances = await fundingBalances(treasury, sender)
        if (!/^\d+(\.\d+)?$/.test(amount) || (amount.split('.')[1]?.length ?? 0) > balances.decimals) throw new Error('Enter a positive amount within TestUSD precision.')
        const units = parseUnits(amount, balances.decimals)
        if (units <= 0n || units > balances.senderBalance) throw new Error('Amount must be positive and within the sender balance.')
        prepared.assertValid()
        if (!adapter?.sendTransaction || await adapter.getAccount() !== sender || await adapter.getChainId() !== deploymentContext.chainId) throw new Error('Wallet configuration changed or cannot submit transactions.')
        prepared.assertValid()
        const hash = await adapter.sendTransaction({ account: sender, to: balances.asset, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [treasury, units] }) })
        emitFunding({ status: 'pending', treasury, sender, amount, hash })
        const receipt = await rpc!.contractClient!.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('Funding transaction reverted.')
        const confirmed = { status: 'confirmed' as const, treasury, sender, amount, hash }
        try { emitFunding({ ...confirmed, balances: await fundingBalances(treasury, sender) }) }
        catch (error) { emitFunding({ ...confirmed, refreshError: error instanceof Error ? error.message : String(error) }) }
      } catch (error) {
        const rejected = error && typeof error === 'object' && 'code' in error && error.code === 4001
        emitFunding({ status: rejected ? 'rejected' : 'failed', message: error instanceof Error ? error.message : String(error) })
      } finally {
        fundingInProgress = false
      }
    },
    // -----------------------------------------------------------------------
    // Read actions
    // -----------------------------------------------------------------------

    readHome() {
      return {
        title: 'DAO for Clubs',
        description: 'Explore your organization. No wallet required to get started.',
        deploymentMessage:
          deploymentContext.daoAddress === null
            ? 'No DAO has been deployed by this scaffold.'
            : 'Public deployment artifacts are available.',
      }
    },

    /** Returns the configured deployment context and chain identity. */
    readDeployment(): DeploymentContext {
      return deploymentContext
    },

    /** Returns the current network state relative to the configured deployment. */
    readNetworkState(): NetworkState {
      return networkState
    },

    /**
     * Queries public deployment information via RPC without requiring a wallet.
     * Distinguishes available RPC, unconfigured deployment, and RPC errors.
     */
    async queryPublicDeployment(): Promise<PublicDeploymentStatus> {
      if (!rpc) {
        return {
          status: 'unconfigured',
          message: 'No RPC endpoint configured for deployment.',
        }
      }
      try {
        const [chainId, blockNumber] = await Promise.all([
          rpc.getChainId(),
          rpc.getBlockNumber(),
        ])
        return {
          status: 'available',
          chainId,
          blockNumber,
          daoAddress: deploymentContext.daoAddress,
          isDeployed: deploymentContext.isDeployed,
        }
      } catch (err) {
        return {
          status: 'rpc-unavailable',
          message: 'RPC endpoint is unavailable.',
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },

    /**
     * Executes a public query function through the RPC adapter without requiring a wallet.
     * Distinguishes an empty successful result from an RPC failure.
     */
    async queryPublicData<T>(
      queryFn: (rpc: RpcAdapter) => Promise<T>
    ): Promise<PublicReadResult<T>> {
      if (!rpc) {
        return {
          status: 'unconfigured',
          message: 'No RPC endpoint configured for deployment.',
        }
      }
      try {
        const data = await queryFn(rpc)
        return {
          status: 'success',
          data,
          chainId: deploymentContext.chainId,
        }
      } catch (err) {
        return {
          status: 'rpc-unavailable',
          message: 'RPC endpoint is unavailable.',
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },

    /** Returns a snapshot of the current wallet connection state. */
    readWalletAccount(): WalletState {
      return walletState
    },

    /** Whether a wallet provider is detectable in the browser environment. */
    isWalletAvailable(): boolean {
      return adapter?.isAvailable() ?? false
    },

    // -----------------------------------------------------------------------
    // Wallet actions
    // -----------------------------------------------------------------------

    /**
     * Request the user to connect their wallet.
     * Updates and emits wallet state; never throws — errors become state.
     */
    async connect(): Promise<void> {
      if (!adapter) {
        emit({ status: 'error', error: new WalletUnavailableError() })
        return
      }
      emit({ status: 'connecting' })
      try {
        const account = await adapter.connect()
        walletChainId = (await adapter.getChainId()) ?? null
        emit({ status: 'connected', account })
        emitNetwork(deriveNetworkState())
        attachAccountListener()
        attachChainListener()
      } catch (err) {
        const domainError = normalizeWalletError(err)
        emit({ status: 'error', error: domainError })
        detachAccountListener()
        detachChainListener()
      }
    },

    /**
     * Disconnect the wallet and clear all session state.
     * Subsequent actions cannot proceed with an obsolete account.
     */
    async disconnect(): Promise<void> {
      if (!adapter) return
      detachAccountListener()
      detachChainListener()
      walletChainId = null
      try {
        await adapter.disconnect()
      } catch {
        // Best-effort; session is cleared regardless.
      }
      emit({ status: 'disconnected' })
      emitNetwork(deriveNetworkState())
    },

    /**
     * Request the wallet to switch to the supported deployment network (or targetChainId).
     * Never throws; failure and rejection become state with retry feedback.
     */
    async switchNetwork(targetChainId?: number): Promise<void> {
      if (!adapter) return
      const target = targetChainId ?? deploymentContext.chainId
      emitNetwork({
        status: 'switching',
        configuredChainId: deploymentContext.chainId,
        targetChainId: target,
      })
      try {
        await adapter.switchChain(target)
        const currentChainId = await adapter.getChainId()
        walletChainId = currentChainId !== null ? currentChainId : target
        emitNetwork(deriveNetworkState())
      } catch (err: unknown) {
        const domainError = normalizeWalletError(err)
        if (
          domainError instanceof NetworkSwitchRejectedError ||
          domainError instanceof NetworkSwitchError
        ) {
          emitNetwork({
            status: 'switch-error',
            configuredChainId: deploymentContext.chainId,
            walletChainId: walletChainId ?? 0,
            error: domainError,
          })
        } else {
          emitNetwork({
            status: 'switch-error',
            configuredChainId: deploymentContext.chainId,
            walletChainId: walletChainId ?? 0,
            error: new NetworkSwitchError(
              domainError instanceof Error ? domainError.message : String(domainError)
            ),
          })
        }
      }
    },

    /**
     * Prepares a deployment-specific action against the configured deployment.
     * Validates that wallet is connected, DAO is deployed, and wallet network matches.
     * Prevents stale chain/account assumptions from proceeding.
     */
    async prepareDeploymentAction(options?: PrepareActionOptions): Promise<PreparedAction> {
      if (walletState.status !== 'connected') {
        throw new WalletNotConnectedError()
      }
      const initialAccount = walletState.account

      if (!deploymentContext.chainId) {
        throw new DeploymentNotConfiguredError()
      }

      let targetAddress: Address | null = null
      if (!options?.target || options.target === 'dao') {
        targetAddress = deploymentContext.daoAddress
      } else if (options.target === 'testUsd') {
        targetAddress = deploymentContext.testUsdAddress
      } else {
        targetAddress = options.target
      }

      if (targetAddress === null) {
        throw new DeploymentNotDeployedError(deploymentContext.chainId)
      }

      const initialChainId = walletChainId
      if (initialChainId !== deploymentContext.chainId) {
        throw new ChainMismatchError(
          deploymentContext.chainId,
          initialChainId ?? 0
        )
      }

      const context: ActionContext = {
        account: initialAccount,
        chainId: initialChainId,
        targetAddress,
      }

      // Run async verification if requested
      if (options?.verify) {
        await options.verify(context)
      }

      // Check for staleness post-verification
      if (
        walletState.status !== 'connected' ||
        walletState.account !== initialAccount ||
        walletChainId !== initialChainId
      ) {
        throw new StaleActionConfigurationError()
      }

      function assertValid() {
        if (
          walletState.status !== 'connected' ||
          walletState.account !== initialAccount ||
          walletChainId !== initialChainId
        ) {
          throw new StaleActionConfigurationError()
        }
      }

      return {
        context,
        assertValid,
        async execute<T>(actionFn: (ctx: ActionContext) => Promise<T>): Promise<T> {
          assertValid()
          return await actionFn(context)
        },
      }
    },

    // -----------------------------------------------------------------------
    // State subscription
    // -----------------------------------------------------------------------

    /**
     * Subscribe to wallet state changes. Returns an unsubscribe function.
     * Call immediately after subscribe to read current state via readWalletAccount().
     */
    onWalletStateChanged(listener: WalletStateListener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    /**
     * Subscribe to network state changes. Returns an unsubscribe function.
     * Call immediately after subscribe to read current state via readNetworkState().
     */
    onNetworkStateChanged(listener: NetworkStateListener): () => void {
      networkListeners.add(listener)
      return () => networkListeners.delete(listener)
    },

    // -----------------------------------------------------------------------
    // Teardown (for tests and hot-module replacement)
    // -----------------------------------------------------------------------
    destroy() {
      fundingListeners.clear()
      detachAccountListener()
      detachChainListener()
      listeners.clear()
      networkListeners.clear()
    },
  }
}

export type Application = ReturnType<typeof createApplication>
