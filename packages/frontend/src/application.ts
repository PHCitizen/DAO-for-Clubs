import publicArtifacts from './generated/public-artifacts.json' with { type: 'json' }
import { decodeEventLog, erc20Abi, isAddress, parseUnits, type Hash, type Hex } from 'viem'
import {
  type WalletAdapter,
  type Address,
  type AccountChangedListener,
  type ChainChangedListener,
  type DomainWalletError,
  WalletUnavailableError,
  NetworkSwitchRejectedError,
  NetworkSwitchError,
  TransactionRejectedError,
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
  RpcUnavailableError,
} from './rpc.js'
import {
  type TreasuryAbis,
  type TreasuryReads,
  type TreasurySnapshot,
  createTreasuryReads,
  TreasuryChainMismatchError,
} from './treasury.js'
import {
  type MintTestUsdOutcome,
  type TestUsdChain,
  type TestUsdConfig,
  type TestUsdInfo,
  type TestUsdTransactionReceipt,
  mintTestUsd,
  readTestUsdInfo,
  TestUsdChainMismatchError,
  TestUsdConfirmationError,
  TestUsdMintRevertedError,
  TestUsdSubmissionError,
} from './testusd.js'

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
// Treasury discovery and inspection results
// ---------------------------------------------------------------------------

export type TreasuryReadFailure =
  | {
      status: 'unconfigured'
      message: string
    }
  | {
      status: 'rpc-unavailable'
      message: string
      error: string
    }
  | {
      status: 'chain-mismatch'
      expectedChainId: number
      actualChainId: number
    }

export interface TreasuryListItem {
  /** Checksummed stable identity used for navigation and refresh reads. */
  address: Address
}

export interface TreasuryDetail extends TreasurySnapshot {
  /** Null when the deployment does not record a shared TestUSD address. */
  isSharedFundingAsset: boolean | null
}

export type TreasuryListResult =
  | {
      status: 'success'
      chainId: number
      treasuries: TreasuryListItem[]
    }
  | TreasuryReadFailure

export type TreasuryDetailResult =
  | {
      status: 'success'
      chainId: number
      treasury: TreasuryDetail
    }
  | {
      status: 'not-found'
      address: string
      reason: 'invalid-address' | 'unregistered'
    }
  | TreasuryReadFailure

// ---------------------------------------------------------------------------
// TestUSD metadata and minting results
// ---------------------------------------------------------------------------

export type TestUsdInfoResult =
  | {
      status: 'success'
      chainId: number
      testUsd: TestUsdInfo
    }
  | TreasuryReadFailure

export type MintTestUsdFailure =
  | {
      status: 'wallet-not-connected'
      message: string
    }
  | {
      status: 'wallet-unavailable'
      message: string
    }
  | {
      status: 'wallet-rejected'
      message: string
    }
  | {
      status: 'stale-configuration'
      message: string
    }
  | {
      status: 'transaction-failed'
      stage: 'submission' | 'reverted' | 'confirmation'
      message: string
      error: string
      hash?: Hex
    }

export type MintTestUsdResult = MintTestUsdOutcome | MintTestUsdFailure | TreasuryReadFailure

export interface MintTestUsdRequest {
  recipient: string
  amount: string
}

function toTreasuryReadFailure(error: unknown): TreasuryReadFailure {
  if (error instanceof TreasuryChainMismatchError) {
    return {
      status: 'chain-mismatch',
      expectedChainId: error.expectedChainId,
      actualChainId: error.actualChainId,
    }
  }
  return {
    status: 'rpc-unavailable',
    message: 'Treasury reads could not reach the configured RPC endpoint.',
    error: error instanceof Error ? error.message : String(error),
  }
}

function toTestUsdReadFailure(error: unknown): TreasuryReadFailure {
  if (error instanceof TestUsdChainMismatchError) {
    return {
      status: 'chain-mismatch',
      expectedChainId: error.expectedChainId,
      actualChainId: error.actualChainId,
    }
  }
  return {
    status: 'rpc-unavailable',
    message: 'TestUSD reads could not reach the configured RPC endpoint.',
    error: error instanceof Error ? error.message : String(error),
  }
}

function toPreparedActionFailure(error: unknown): MintTestUsdFailure | TreasuryReadFailure {
  if (error instanceof WalletNotConnectedError) {
    return {
      status: 'wallet-not-connected',
      message: 'Connect the designated TestUSD administrator wallet to mint.',
    }
  }
  if (error instanceof DeploymentNotDeployedError) {
    return {
      status: 'unconfigured',
      message: 'The shared TestUSD contract is not deployed on the configured chain.',
    }
  }
  if (error instanceof DeploymentNotConfiguredError) {
    return {
      status: 'unconfigured',
      message: 'The deployment configuration is missing or invalid.',
    }
  }
  if (error instanceof ChainMismatchError) {
    return {
      status: 'chain-mismatch',
      expectedChainId: error.expectedChainId,
      actualChainId: error.actualChainId,
    }
  }
  if (error instanceof StaleActionConfigurationError) {
    return { status: 'stale-configuration', message: error.message }
  }
  return {
    status: 'transaction-failed',
    stage: 'submission',
    message: 'Minting could not be prepared.',
    error: error instanceof Error ? error.message : String(error),
  }
}

function toMintTestUsdFailure(error: unknown): MintTestUsdResult {
  if (error instanceof StaleActionConfigurationError) {
    return { status: 'stale-configuration', message: error.message }
  }
  if (error instanceof TestUsdChainMismatchError) {
    return {
      status: 'chain-mismatch',
      expectedChainId: error.expectedChainId,
      actualChainId: error.actualChainId,
    }
  }
  if (error instanceof TestUsdMintRevertedError) {
    return {
      status: 'transaction-failed',
      stage: 'reverted',
      message: 'The mint transaction reverted on-chain. No currency was minted.',
      error: error.message,
      hash: error.hash,
    }
  }
  if (error instanceof TestUsdConfirmationError) {
    return {
      status: 'transaction-failed',
      stage: 'confirmation',
      message: error.message,
      error: error.message,
      ...(error.hash === null ? {} : { hash: error.hash }),
    }
  }
  if (error instanceof TestUsdSubmissionError) {
    if (error.cause instanceof TransactionRejectedError) {
      return {
        status: 'wallet-rejected',
        message: 'The mint transaction was rejected in your wallet. Nothing was submitted.',
      }
    }
    return {
      status: 'transaction-failed',
      stage: 'submission',
      message: 'The mint transaction was not submitted.',
      error: error.message,
    }
  }
  return {
    status: 'rpc-unavailable',
    message: 'TestUSD minting could not reach the configured RPC endpoint.',
    error: error instanceof Error ? error.message : String(error),
  }
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
export type FundingRequest = { treasury: Address; sender: Address; amount: string }
export type FundingState =
  | { status: 'idle' }
  | (FundingRequest & { status: 'submitting' })
  | (FundingRequest & { status: 'pending'; hash: Hash })
  | (FundingRequest & { status: 'confirmed'; hash: Hash; balances?: FundingBalances; refreshError?: string })
  | { status: 'rejected' | 'failed'; message: string }

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

  const publicAbis = publicArtifacts.abis as unknown as TreasuryAbis

  const treasuryReads: TreasuryReads | null =
    rpc?.readContract && deploymentContext.daoAddress
      ? createTreasuryReads(
          {
            getChainId: () => rpc!.getChainId(),
            readContract: <T>(request: Parameters<NonNullable<RpcAdapter['readContract']>>[0]) =>
              rpc!.readContract!<T>(request),
          },
          {
            chainId: deploymentContext.chainId,
            daoAddress: deploymentContext.daoAddress,
            abis: publicAbis,
          }
        )
      : null

  const testUsdConfig: TestUsdConfig | null = deploymentContext.testUsdAddress
    ? {
        chainId: deploymentContext.chainId,
        testUsdAddress: deploymentContext.testUsdAddress,
        abi: publicAbis.TestUSD,
      }
    : null

  const testUsdChain: TestUsdChain | null =
    rpc?.readContract && testUsdConfig
      ? {
          getChainId: () => rpc!.getChainId(),
          readContract: <T>(request: Parameters<NonNullable<RpcAdapter['readContract']>>[0]) =>
            rpc!.readContract!<T>(request),
          sendTransaction: async (request) => {
            if (!adapter) throw new WalletUnavailableError()
            return adapter.sendTransaction({
              from: request.from,
              to: request.address,
              abi: request.abi,
              functionName: request.functionName,
              args: request.args,
            })
          },
          waitForTransactionReceipt: (hash: Hex): Promise<TestUsdTransactionReceipt> => {
            if (!rpc!.waitForTransactionReceipt) {
              throw new RpcUnavailableError('Transaction confirmation is not available.')
            }
            return rpc!.waitForTransactionReceipt(hash)
          },
        }
      : null

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
    const contracts = rpc?.contracts
    const dao = deploymentContext.daoAddress
    const asset = deploymentContext.testUsdAddress
    if (!contracts || !dao || !asset || !deploymentContext.isSupported || !isAddress(treasury)) throw new Error('Funding deployment is unavailable or invalid.')
    if (await rpc!.getChainId() !== deploymentContext.chainId) throw new Error('RPC deployment chain mismatch.')
    const { shared, registered, ownerDao, fundingAsset } = await contracts.readDeployment(dao, treasury)
    if (!registered || shared.toLowerCase() !== asset.toLowerCase() || fundingAsset.toLowerCase() !== asset.toLowerCase() || ownerDao.toLowerCase() !== dao.toLowerCase()) throw new Error('Treasury does not belong to the configured deployment.')
    const { decimals, senderBalance, treasuryBalance } = await contracts.readBalances(asset, sender, treasury)
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
        const request: FundingRequest = { treasury, sender, amount }
        emitFunding({ status: 'submitting', ...request })
        const balances = await fundingBalances(treasury, sender)
        if (!/^\d+(\.\d+)?$/.test(amount) || (amount.split('.')[1]?.length ?? 0) > balances.decimals) throw new Error('Enter a positive amount within TestUSD precision.')
        const units = parseUnits(amount, balances.decimals)
        if (units <= 0n || units > balances.senderBalance) throw new Error('Amount must be positive and within the sender balance.')
        prepared.assertValid()
        if (!adapter?.sendTransaction || await adapter.getAccount() !== sender || await adapter.getChainId() !== deploymentContext.chainId) throw new Error('Wallet configuration changed or cannot submit transactions.')
        prepared.assertValid()
        const hash = await adapter.sendTransaction({ from: sender, to: balances.asset, abi: erc20Abi, functionName: 'transfer', args: [treasury, units] })
        emitFunding({ status: 'pending', ...request, hash })
        const receipt = await rpc!.contracts!.waitForReceipt(hash)
        if (receipt.status !== 'success') throw new Error('Funding transaction reverted.')
        const transferred = receipt.logs.some(log => {
          if (log.address.toLowerCase() !== balances.asset.toLowerCase()) return false
          try {
            const event = decodeEventLog({ abi: erc20Abi, eventName: 'Transfer', data: log.data, topics: log.topics })
            return event.args.from.toLowerCase() === sender.toLowerCase() && event.args.to.toLowerCase() === treasury.toLowerCase() && event.args.value === units
          } catch { return false }
        })
        if (!transferred) throw new Error('Mined transaction did not transfer the requested TestUSD amount to this treasury.')
        const confirmed = { status: 'confirmed' as const, ...request, hash: receipt.transactionHash }
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

    /**
     * Lists treasury identities registered by the configured DAO.
     * Wallet-free: reads the chain through the public RPC seam only.
     * An empty registry is a successful result, never an RPC failure.
     */
    async listTreasuries(): Promise<TreasuryListResult> {
      if (!treasuryReads) {
        return {
          status: 'unconfigured',
          message: 'Treasury discovery requires a configured DAO deployment and RPC endpoint.',
        }
      }
      try {
        const addresses = await treasuryReads.listTreasuries()
        return {
          status: 'success',
          chainId: deploymentContext.chainId,
          treasuries: addresses.map((address) => ({ address })),
        }
      } catch (err) {
        return toTreasuryReadFailure(err)
      }
    },

    /**
     * Reads one registered treasury's administrator, funding asset, and current
     * TestUSD balance. Wallet-free and scoped to the configured deployment.
     */
    async readTreasury(address: string): Promise<TreasuryDetailResult> {
      if (!treasuryReads) {
        return {
          status: 'unconfigured',
          message: 'Treasury inspection requires a configured DAO deployment and RPC endpoint.',
        }
      }
      if (!isAddress(address)) {
        return { status: 'not-found', address, reason: 'invalid-address' }
      }
      try {
        const snapshot = await treasuryReads.readTreasury(address)
        if (snapshot === null) {
          return { status: 'not-found', address, reason: 'unregistered' }
        }
        const configuredTestUsd = deploymentContext.testUsdAddress
        return {
          status: 'success',
          chainId: deploymentContext.chainId,
          treasury: {
            ...snapshot,
            isSharedFundingAsset:
              configuredTestUsd === null
                ? null
                : snapshot.fundingAsset.toLowerCase() === configuredTestUsd.toLowerCase(),
          },
        }
      } catch (err) {
        return toTreasuryReadFailure(err)
      }
    },

    /**
     * Reads the shared TestUSD identity, symbol, decimals, and designated
     * currency administrator without requiring a wallet.
     */
    async readTestUsd(): Promise<TestUsdInfoResult> {
      if (!testUsdChain || !testUsdConfig) {
        return {
          status: 'unconfigured',
          message: 'TestUSD metadata requires a configured shared token deployment and RPC endpoint.',
        }
      }
      try {
        const testUsd = await readTestUsdInfo(testUsdChain, testUsdConfig)
        return {
          status: 'success',
          chainId: deploymentContext.chainId,
          testUsd,
        }
      } catch (err) {
        return toTestUsdReadFailure(err)
      }
    },

    /**
     * Sends a mint through the connected authorized wallet, waits for its
     * confirmation, decodes the actual minted amount, and reads the updated
     * recipient balance.
     */
    async mintTestUsd(request: MintTestUsdRequest): Promise<MintTestUsdResult> {
      if (!testUsdChain || !testUsdConfig) {
        return {
          status: 'unconfigured',
          message: 'TestUSD minting requires a configured shared token deployment and RPC endpoint.',
        }
      }
      if (!adapter) {
        return {
          status: 'wallet-unavailable',
          message: 'No wallet extension is available to sign the mint transaction.',
        }
      }

      let prepared
      try {
        prepared = await this.prepareDeploymentAction({ target: 'testUsd' })
      } catch (err) {
        return toPreparedActionFailure(err)
      }

      try {
        prepared.assertValid()
        return await mintTestUsd(testUsdChain, testUsdConfig, {
          from: prepared.context.account,
          recipient: request.recipient,
          amount: request.amount,
        })
      } catch (err) {
        return toMintTestUsdFailure(err)
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
