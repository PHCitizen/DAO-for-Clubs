import publicArtifacts from './generated/public-artifacts.json' with { type: 'json' }
import { decodeEventLog, erc20Abi, formatUnits, isAddress, parseUnits, type Hash, type Hex } from 'viem'
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
  type MintVotingNftOutcome,
  type MembershipChain,
  type MembershipConfig,
  type VotingMembership,
  mintVotingNft,
  burnVotingNft,
  type BurnVotingNftOutcome,
  VotingNftBurnRevertedError,
  readVotingMembership,
  MembershipChainMismatchError,
  VotingNftConfirmationError,
  VotingNftMintRevertedError,
  VotingNftSubmissionError,
} from './membership.js'
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
import {
  type ProposalDocument,
  PROPOSAL_DOCUMENT_VERSION,
  encodeProposalDocument,
  renderProposalMarkdown,
} from './proposal.js'
import {
  type IpfsCredentials,
  type IpfsTransport,
  formatIpfsReference,
  isValidCid,
} from './ipfs.js'
import {
  type ProposalChain,
  type ProposalConfig,
  type ProposalTerms,
  ProposalChainMismatchError,
  ProposalConfirmationError,
  ProposalRevertedError,
  ProposalSubmissionError,
  createProposalOnChain,
  readProposalCount,
  readProposalTerms,
} from './proposalCreation.js'

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

// ---------------------------------------------------------------------------
// Voting NFT membership results
// ---------------------------------------------------------------------------

export type VotingMembershipResult =
  | {
      status: 'success'
      chainId: number
      membership: VotingMembership
    }
  | {
      status: 'not-found'
      address: string
      reason: 'invalid-address' | 'unregistered'
    }
  | TreasuryReadFailure

export type TransactionActionFailure =
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

export type MintVotingNftResult =
  | Exclude<MintVotingNftOutcome, { status: 'unknown-treasury' }>
  | { status: 'not-found'; address: string; reason: 'invalid-address' | 'unregistered' }
  | TransactionActionFailure
  | TreasuryReadFailure

export interface MintVotingNftRequest {
  treasury: string
  holder: string
}

export type BurnVotingNftResult =
  | Exclude<BurnVotingNftOutcome, { status: 'unknown-treasury' }>
  | { status: 'not-found'; address: string; reason: 'invalid-address' | 'unregistered' }
  | TransactionActionFailure
  | TreasuryReadFailure

// ---------------------------------------------------------------------------
// Shared chain error mapping
// ---------------------------------------------------------------------------

/** Constructor shape shared by the per-domain chain-mismatch error classes. */
type ChainMismatchErrorType = new (
  expectedChainId: number,
  actualChainId: number
) => Error & { readonly expectedChainId: number; readonly actualChainId: number }

/**
 * Maps the shared chain-read error taxonomy (chain mismatch, RPC failure) to a
 * public read failure. Each domain supplies its own mismatch error class and
 * RPC failure message.
 */
function toChainReadFailure(
  error: unknown,
  mismatchError: ChainMismatchErrorType,
  rpcUnavailableMessage: string
): TreasuryReadFailure {
  if (error instanceof mismatchError) {
    return {
      status: 'chain-mismatch',
      expectedChainId: error.expectedChainId,
      actualChainId: error.actualChainId,
    }
  }
  return {
    status: 'rpc-unavailable',
    message: rpcUnavailableMessage,
    error: error instanceof Error ? error.message : String(error),
  }
}

function toProposalReadFailure(error: unknown): TreasuryReadFailure {
  return toChainReadFailure(
    error,
    ProposalChainMismatchError,
    'Proposal reads could not reach the configured RPC endpoint.'
  )
}

/** Per-domain error classes of one transaction action's error taxonomy. */
interface TransactionErrorTaxonomy {
  ChainMismatchError: ChainMismatchErrorType
  RevertedError: new (hash: Hex) => Error & { readonly hash: Hex }
  ConfirmationError: new (
    message: string,
    hash?: Hex | null
  ) => Error & { readonly hash: Hex | null }
  SubmissionError: new (message: string, cause: unknown) => Error & { readonly cause: unknown }
}

/** Per-domain copy for the mapped transaction failures. */
interface TransactionFailureCopy {
  revertedMessage: string
  rpcUnavailableMessage: string
  rejectedMessage: string
  submissionMessage: string
}

/**
 * Maps the shared transaction-action error taxonomy (stale preparation, chain
 * mismatch, wallet rejection, submission failure, revert, confirmation
 * failure, RPC failure) to public failure results.
 */
function toTransactionFailure(
  error: unknown,
  errors: TransactionErrorTaxonomy,
  copy: TransactionFailureCopy
): TransactionActionFailure | TreasuryReadFailure {
  if (error instanceof StaleActionConfigurationError) {
    return { status: 'stale-configuration', message: error.message }
  }
  if (error instanceof errors.ChainMismatchError) {
    return {
      status: 'chain-mismatch',
      expectedChainId: error.expectedChainId,
      actualChainId: error.actualChainId,
    }
  }
  if (error instanceof errors.RevertedError) {
    return {
      status: 'transaction-failed',
      stage: 'reverted',
      message: copy.revertedMessage,
      error: error.message,
      hash: error.hash,
    }
  }
  if (error instanceof errors.ConfirmationError) {
    return {
      status: 'transaction-failed',
      stage: 'confirmation',
      message: error.message,
      error: error.message,
      ...(error.hash === null ? {} : { hash: error.hash }),
    }
  }
  if (error instanceof errors.SubmissionError) {
    const cause = error.cause
    const rejected =
      cause instanceof TransactionRejectedError ||
      (cause !== null && typeof cause === 'object' && 'code' in cause && cause.code === 4001)
    if (rejected) {
      return {
        status: 'wallet-rejected',
        message: copy.rejectedMessage,
      }
    }
    return {
      status: 'transaction-failed',
      stage: 'submission',
      message: copy.submissionMessage,
      error: error.message,
    }
  }
  return {
    status: 'rpc-unavailable',
    message: copy.rpcUnavailableMessage,
    error: error instanceof Error ? error.message : String(error),
  }
}

function toMembershipReadFailure(error: unknown): TreasuryReadFailure {
  return toChainReadFailure(
    error,
    MembershipChainMismatchError,
    'Voting NFT membership could not reach the configured RPC endpoint.'
  )
}

function toMintVotingNftFailure(error: unknown): MintVotingNftResult {
  return toTransactionFailure(
    error,
    {
      ChainMismatchError: MembershipChainMismatchError,
      RevertedError: VotingNftMintRevertedError,
      ConfirmationError: VotingNftConfirmationError,
      SubmissionError: VotingNftSubmissionError,
    },
    {
      revertedMessage: 'The mint transaction reverted on-chain. No voting NFT was minted.',
      rpcUnavailableMessage: 'Voting NFT minting could not reach the configured RPC endpoint.',
      rejectedMessage: 'The mint transaction was rejected in your wallet. Nothing was submitted.',
      submissionMessage: 'The mint transaction was not submitted.',
    }
  )
}

function toTreasuryReadFailure(error: unknown): TreasuryReadFailure {
  return toChainReadFailure(
    error,
    TreasuryChainMismatchError,
    'Treasury reads could not reach the configured RPC endpoint.'
  )
}

function toTestUsdReadFailure(error: unknown): TreasuryReadFailure {
  return toChainReadFailure(
    error,
    TestUsdChainMismatchError,
    'TestUSD reads could not reach the configured RPC endpoint.'
  )
}

function toPreparedActionFailure(error: unknown): MintTestUsdFailure | TreasuryReadFailure {
  if (error instanceof WalletNotConnectedError) {
    return {
      status: 'wallet-not-connected',
      message: 'Connect the authorized administrator wallet to mint.',
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
  return toTransactionFailure(
    error,
    {
      ChainMismatchError: TestUsdChainMismatchError,
      RevertedError: TestUsdMintRevertedError,
      ConfirmationError: TestUsdConfirmationError,
      SubmissionError: TestUsdSubmissionError,
    },
    {
      revertedMessage: 'The mint transaction reverted on-chain. No currency was minted.',
      rpcUnavailableMessage: 'TestUSD minting could not reach the configured RPC endpoint.',
      rejectedMessage: 'The mint transaction was rejected in your wallet. Nothing was submitted.',
      submissionMessage: 'The mint transaction was not submitted.',
    }
  )
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

// ---------------------------------------------------------------------------
// Proposal draft authoring
// ---------------------------------------------------------------------------
//
// Drafting is wallet-free and chain-free. The draft lives only in memory for
// the current page load; persistent backup is intentionally out of scope.

export interface ProposalDraft {
  title: string
  markdown: string
}

export interface ProposalDraftPreview {
  /** Snapshot of the reviewed draft. */
  draft: ProposalDraft
  /** Versioned document representation consumed by publication. */
  document: ProposalDocument
  /** Sanitized HTML produced by the shared safe-rendering policy. */
  html: string
  /** Size of the exact UTF-8 document bytes that would be published. */
  encodedBytes: number
}

export interface EncodedProposalDraft {
  document: ProposalDocument
  bytes: Uint8Array
}

export type ProposalDraftListener = (draft: ProposalDraft) => void

// ---------------------------------------------------------------------------
// Proposal document pinning
// ---------------------------------------------------------------------------
//
// Pinning publishes the exact reviewed document to IPFS. It never allocates a
// proposal ID and never claims an on-chain proposal exists.

export const PROPOSAL_DOCUMENT_FILENAME = 'proposal-document.json'
export const PROPOSAL_DOCUMENT_CONTENT_TYPE = 'application/json'

export interface ProposalPin {
  /** The document snapshot that was uploaded. */
  document: ProposalDocument
  /** Exact uploaded bytes; the reference is bound to these bytes only. */
  bytes: Uint8Array
  cid: string
  /** `ipfs://<cid>` reference for a later on-chain proposal. */
  reference: string
}

export type ProposalPinState =
  | { status: 'not-pinned' }
  | { status: 'uploading' }
  | { status: 'pinned'; pin: ProposalPin }
  /** A pin exists, but the current draft no longer matches its bytes. */
  | { status: 'draft-changed'; previousReference: string }
  | { status: 'upload-failed'; message: string; retryable: true }

export type ProposalPinResult =
  | { status: 'pinned'; pin: ProposalPin }
  | { status: 'invalid-draft'; message: string }
  | { status: 'credentials-required'; message: string }
  | { status: 'ipfs-unavailable'; message: string }
  | { status: 'busy'; message: string }
  | { status: 'upload-failed'; message: string; retryable: true }
  | { status: 'invalid-upload-result'; message: string; retryable: true }
  /** Uploaded bytes belong to an older draft; the current draft is not pinned. */
  | { status: 'draft-changed-during-upload'; message: string; pin: ProposalPin }

export interface ApplicationOptions {
  /** IPFS transport used for proposal pinning; omit to disable pinning. */
  ipfs?: IpfsTransport
}

// ---------------------------------------------------------------------------
// On-chain proposal creation
// ---------------------------------------------------------------------------

export interface CreateProposalRequest {
  treasury: string
  amount: string
  /** Unix timestamp in seconds. */
  votingDeadline: number
}

export interface ConfirmedProposal {
  hash: Hex
  proposal: ProposalTerms
  formattedAmount: string
  symbol: string
}

export type ProposalCreationState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'pending'; hash: Hex }
  | ({ status: 'confirmed' } & ConfirmedProposal)
  | { status: 'rejected'; message: string; documentReference: string }
  | { status: 'failed'; message: string; retryable: true; documentReference: string }

export type CreateProposalResult =
  | ({ status: 'created' } & ConfirmedProposal)
  | {
      status:
        | 'not-pinned'
        | 'stale-reference'
        | 'invalid-treasury'
        | 'unregistered-treasury'
        | 'invalid-amount'
        | 'invalid-deadline'
        | 'invalid-reference'
        | 'unconfigured'
        | 'wallet-unavailable'
        | 'wallet-not-connected'
        | 'chain-mismatch'
      message: string
    }
  | { status: 'rejected'; message: string }
  | { status: 'failed'; message: string; retryable: true }

export type ProposalReadResult =
  | {
      status: 'success'
      chainId: number
      proposal: ProposalTerms
      formattedAmount: string
      symbol: string
      decimals: number
    }
  | { status: 'not-found'; id: bigint }
  | TreasuryReadFailure

export type ProposalCountResult =
  | { status: 'success'; chainId: number; count: bigint }
  | TreasuryReadFailure

export function createApplication(
  adapter?: WalletAdapter,
  injectedRpcAdapter?: RpcAdapter,
  deploymentConfig?: Partial<DeploymentConfig>,
  options: ApplicationOptions = {}
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

  const membershipConfig: MembershipConfig | null = deploymentContext.daoAddress
    ? {
        chainId: deploymentContext.chainId,
        daoAddress: deploymentContext.daoAddress,
        daoAbi: publicAbis.DAO,
        treasuryAbi: publicAbis.Treasury,
      }
    : null

  const membershipChain: MembershipChain | null =
    rpc?.readContract && membershipConfig
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
          waitForTransactionReceipt: async (hash: Hex) => {
            if (!rpc!.waitForTransactionReceipt) {
              throw new RpcUnavailableError('Transaction confirmation is not available.')
            }
            return rpc!.waitForTransactionReceipt(hash)
          },
        }
      : null

  const proposalConfig: ProposalConfig | null =
    deploymentContext.daoAddress && deploymentContext.testUsdAddress
      ? {
          chainId: deploymentContext.chainId,
          daoAddress: deploymentContext.daoAddress,
          testUsdAddress: deploymentContext.testUsdAddress,
          daoAbi: publicAbis.DAO,
          testUsdAbi: publicAbis.TestUSD,
        }
      : null

  const proposalChain: ProposalChain | null =
    rpc?.readContract && proposalConfig
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
          waitForTransactionReceipt: (hash: Hex) => {
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

  // In-memory proposal draft; never requires a wallet or a chain read.
  let proposalDraft: ProposalDraft = { title: '', markdown: '' }
  const proposalDraftListeners = new Set<ProposalDraftListener>()

  function currentProposalDocument(): ProposalDocument {
    return {
      version: PROPOSAL_DOCUMENT_VERSION,
      title: proposalDraft.title,
      markdown: proposalDraft.markdown,
    }
  }

  const ipfs = options.ipfs ?? null

  // Only the pinned document/bytes/reference are retained. Credentials are
  // never stored in application state.
  let pinnedProposal: ProposalPin | null = null
  let proposalUploadInFlight = false
  let proposalUploadError: string | null = null
  const proposalPinListeners = new Set<(state: ProposalPinState) => void>()

  function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) return false
    for (let i = 0; i < a.byteLength; i += 1) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  function currentProposalBytes(): Uint8Array {
    return encodeProposalDocument(currentProposalDocument())
  }

  function readProposalPinState(): ProposalPinState {
    if (proposalUploadInFlight) return { status: 'uploading' }
    if (pinnedProposal) {
      if (bytesEqual(pinnedProposal.bytes, currentProposalBytes())) {
        return { status: 'pinned', pin: pinnedProposal }
      }
      return { status: 'draft-changed', previousReference: pinnedProposal.reference }
    }
    if (proposalUploadError !== null) {
      return { status: 'upload-failed', message: proposalUploadError, retryable: true }
    }
    return { status: 'not-pinned' }
  }

  function emitProposalPinState() {
    const state = readProposalPinState()
    for (const listener of proposalPinListeners) listener(state)
  }

  let proposalCreationState: ProposalCreationState = { status: 'idle' }
  const proposalCreationListeners = new Set<(state: ProposalCreationState) => void>()
  function emitProposalCreation(state: ProposalCreationState) {
    proposalCreationState = state
    for (const listener of proposalCreationListeners) listener(state)
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
    // -----------------------------------------------------------------------
    // Proposal draft authoring and safe preview
    // -----------------------------------------------------------------------

    readProposalDraft(): ProposalDraft {
      return { ...proposalDraft }
    },

    onProposalDraftChanged(listener: ProposalDraftListener) {
      proposalDraftListeners.add(listener)
      return () => {
        proposalDraftListeners.delete(listener)
      }
    },

    /** Replaces the given draft fields and notifies subscribers. */
    updateProposalDraft(change: Partial<ProposalDraft>): ProposalDraft {
      proposalDraft = {
        title: change.title ?? proposalDraft.title,
        markdown: change.markdown ?? proposalDraft.markdown,
      }
      // A new edit starts a fresh upload attempt; any previous pin is kept
      // only so staleness can be reported against the changed draft.
      proposalUploadError = null
      const snapshot = { ...proposalDraft }
      for (const listener of proposalDraftListeners) listener(snapshot)
      emitProposalPinState()
      return snapshot
    },

    /** Renders the current draft with the shared safe-Markdown policy. */
    previewProposalDraft(): ProposalDraftPreview {
      const document = currentProposalDocument()
      return {
        draft: { ...proposalDraft },
        document,
        html: renderProposalMarkdown(document.markdown),
        encodedBytes: encodeProposalDocument(document).byteLength,
      }
    },

    /**
     * Exact versioned document bytes for the current draft. The publication
     * ticket pins these bytes; changing the draft changes the bytes.
     */
    encodeProposalDraft(): EncodedProposalDraft {
      const document = currentProposalDocument()
      return { document, bytes: encodeProposalDocument(document) }
    },

    readProposalPinState,

    onProposalPinStateChanged(listener: (state: ProposalPinState) => void) {
      proposalPinListeners.add(listener)
      return () => {
        proposalPinListeners.delete(listener)
      }
    },

    /**
     * Uploads the exact reviewed document bytes with the proposer's own
     * credentials and binds the returned reference to those bytes. The token
     * is used for this request only and is never retained.
     */
    async pinProposalDraft(credentials: IpfsCredentials): Promise<ProposalPinResult> {
      if (!ipfs) {
        return {
          status: 'ipfs-unavailable',
          message: 'No IPFS pinning transport is configured for this application.',
        }
      }
      if (proposalUploadInFlight) {
        return { status: 'busy', message: 'An upload is already in progress.' }
      }
      if (credentials.token.trim().length === 0) {
        return {
          status: 'credentials-required',
          message: 'Enter your own IPFS pinning token to upload the document.',
        }
      }
      if (proposalDraft.title.trim().length === 0) {
        return { status: 'invalid-draft', message: 'Give the proposal an event title before pinning.' }
      }
      if (proposalDraft.markdown.trim().length === 0) {
        return {
          status: 'invalid-draft',
          message: 'Write the event and funding request before pinning.',
        }
      }

      // Capture the reviewed bytes now; a later edit must not change what is
      // uploaded or which document the reference describes.
      const { document, bytes } = this.encodeProposalDraft()
      proposalUploadError = null
      proposalUploadInFlight = true
      emitProposalPinState()

      const fail = (
        status: 'upload-failed' | 'invalid-upload-result',
        message: string
      ): ProposalPinResult => {
        proposalUploadInFlight = false
        proposalUploadError = message
        emitProposalPinState()
        return { status, message, retryable: true }
      }

      let pin: ProposalPin
      try {
        const receipt = await ipfs.pin(
          {
            bytes,
            name: PROPOSAL_DOCUMENT_FILENAME,
            contentType: PROPOSAL_DOCUMENT_CONTENT_TYPE,
          },
          { token: credentials.token }
        )
        if (!isValidCid(receipt.cid)) {
          return fail(
            'invalid-upload-result',
            'The pinning service returned an invalid content identifier. Nothing was pinned for this draft.'
          )
        }
        if (receipt.size !== undefined && receipt.size !== bytes.byteLength) {
          return fail(
            'invalid-upload-result',
            'The pinning service reported a different document size than the reviewed draft.'
          )
        }
        pin = {
          document,
          bytes,
          cid: receipt.cid,
          reference: formatIpfsReference(receipt.cid),
        }
      } catch (error) {
        return fail(
          'upload-failed',
          `The document upload failed and can be retried: ${error instanceof Error ? error.message : String(error)}`
        )
      }

      pinnedProposal = pin
      proposalUploadInFlight = false
      proposalUploadError = null
      emitProposalPinState()

      if (!bytesEqual(currentProposalBytes(), bytes)) {
        return {
          status: 'draft-changed-during-upload',
          message:
            'The draft changed during upload. The returned reference describes the older document; pin the updated draft before creating a proposal.',
          pin,
        }
      }
      return { status: 'pinned', pin }
    },

    // -----------------------------------------------------------------------
    // On-chain proposal creation and reads
    // -----------------------------------------------------------------------

    readProposalCreationState: () => proposalCreationState,

    onProposalCreationStateChanged(listener: (state: ProposalCreationState) => void) {
      proposalCreationListeners.add(listener)
      return () => {
        proposalCreationListeners.delete(listener)
      }
    },

    /**
     * Creates an immutable proposal using the currently pinned document. A
     * stale reference is never submitted: the draft must be re-pinned first.
     * A failed transaction leaves the document pinned without a proposal.
     */
    async createProposal(request: CreateProposalRequest): Promise<CreateProposalResult> {
      const pinState = readProposalPinState()
      if (pinState.status === 'draft-changed') {
        return {
          status: 'stale-reference',
          message:
            'The draft changed after pinning. Pin the updated document before creating a proposal; the obsolete reference will not be reused.',
        }
      }
      if (pinState.status !== 'pinned') {
        return {
          status: 'not-pinned',
          message: 'Pin the reviewed document before creating a proposal.',
        }
      }
      const documentReference = pinState.pin.reference

      if (!proposalChain || !proposalConfig) {
        return {
          status: 'unconfigured',
          message: 'Proposal creation requires a configured DAO deployment and RPC endpoint.',
        }
      }
      if (!adapter) {
        return {
          status: 'wallet-unavailable',
          message: 'No wallet extension is available to sign the proposal transaction.',
        }
      }

      let prepared
      try {
        prepared = await this.prepareDeploymentAction({ target: 'dao' })
      } catch (error) {
        if (error instanceof WalletNotConnectedError) {
          return {
            status: 'wallet-not-connected',
            message: 'Connect the organizer wallet to create the proposal.',
          }
        }
        if (error instanceof ChainMismatchError) {
          return {
            status: 'chain-mismatch',
            message: `The wallet is on chain ${error.actualChainId}, but this deployment uses chain ${error.expectedChainId}.`,
          }
        }
        return {
          status: 'unconfigured',
          message: error instanceof Error ? error.message : String(error),
        }
      }

      try {
        prepared.assertValid()
        emitProposalCreation({ status: 'submitting' })
        const outcome = await createProposalOnChain(
          proposalChain,
          proposalConfig,
          {
            from: prepared.context.account,
            treasury: request.treasury,
            amount: request.amount,
            votingDeadline: request.votingDeadline,
            documentReference,
          },
          { onSubmitted: (hash) => emitProposalCreation({ status: 'pending', hash }) }
        )

        if (outcome.status !== 'success') {
          emitProposalCreation({ status: 'idle' })
          return { status: outcome.status, message: outcome.message }
        }

        const confirmed: ConfirmedProposal = {
          hash: outcome.hash,
          proposal: outcome.proposal,
          formattedAmount: outcome.formattedAmount,
          symbol: outcome.symbol,
        }
        emitProposalCreation({ status: 'confirmed', ...confirmed })
        return { status: 'created', ...confirmed }
      } catch (error) {
        if (error instanceof ProposalSubmissionError && error.cause instanceof TransactionRejectedError) {
          const message =
            'The proposal transaction was rejected in your wallet. The document is still pinned, but no proposal was created.'
          emitProposalCreation({ status: 'rejected', message, documentReference })
          return { status: 'rejected', message }
        }

        const message =
          error instanceof ProposalRevertedError
            ? `The proposal transaction reverted on-chain. The document remains pinned at ${documentReference}, but no proposal was created. You can retry.`
            : error instanceof ProposalConfirmationError
              ? `The proposal could not be confirmed: ${error.message}. The document remains pinned; review the transaction before retrying.`
              : error instanceof ProposalChainMismatchError
                ? `The wallet or RPC is on the wrong chain (expected ${error.expectedChainId}, got ${error.actualChainId}).`
                : `Proposal creation failed: ${error instanceof Error ? error.message : String(error)}. The document remains pinned; no proposal was recorded.`

        emitProposalCreation({ status: 'failed', message, retryable: true, documentReference })
        return { status: 'failed', message, retryable: true }
      }
    },

    /** Reads the immutable identity and terms used by voting/payouts/attendance. */
    async readProposal(id: bigint): Promise<ProposalReadResult> {
      if (!proposalChain || !proposalConfig) {
        return {
          status: 'unconfigured',
          message: 'Proposal reads require a configured DAO deployment and RPC endpoint.',
        }
      }
      try {
        const proposal = await readProposalTerms(proposalChain, proposalConfig, id)
        if (proposal === null) return { status: 'not-found', id }
        const [decimals, symbol] = await Promise.all([
          proposalChain.readContract<number>({
            address: proposalConfig.testUsdAddress,
            abi: proposalConfig.testUsdAbi,
            functionName: 'decimals',
          }),
          proposalChain.readContract<string>({
            address: proposalConfig.testUsdAddress,
            abi: proposalConfig.testUsdAbi,
            functionName: 'symbol',
          }),
        ])
        const tokenDecimals = Number(decimals)
        return {
          status: 'success',
          chainId: proposalConfig.chainId,
          proposal,
          formattedAmount: formatUnits(proposal.amount, tokenDecimals),
          symbol,
          decimals: tokenDecimals,
        }
      } catch (error) {
        return toProposalReadFailure(error)
      }
    },

    async readProposalCount(): Promise<ProposalCountResult> {
      if (!proposalChain || !proposalConfig) {
        return {
          status: 'unconfigured',
          message: 'Proposal reads require a configured DAO deployment and RPC endpoint.',
        }
      }
      try {
        const count = await readProposalCount(proposalChain, proposalConfig)
        return { status: 'success', chainId: proposalConfig.chainId, count }
      } catch (error) {
        return toProposalReadFailure(error)
      }
    },

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

    /**
     * Reads a registered treasury's voting membership: administrator, live
     * voting NFT supply, and — when a holder address is given — that holder's
     * confirmed credentials. Wallet-free and scoped to the configured DAO.
     */
    async readVotingMembership(treasury: string, holder?: string): Promise<VotingMembershipResult> {
      if (!membershipChain || !membershipConfig) {
        return {
          status: 'unconfigured',
          message: 'Voting membership inspection requires a configured DAO deployment and RPC endpoint.',
        }
      }
      if (!isAddress(treasury)) {
        return { status: 'not-found', address: treasury, reason: 'invalid-address' }
      }
      if (holder !== undefined && !isAddress(holder)) {
        return { status: 'not-found', address: holder, reason: 'invalid-address' }
      }
      try {
        const membership = await readVotingMembership(membershipChain, membershipConfig, treasury, holder)
        if (membership === null) {
          return { status: 'not-found', address: treasury, reason: 'unregistered' }
        }
        return { status: 'success', chainId: deploymentContext.chainId, membership }
      } catch (err) {
        return toMembershipReadFailure(err)
      }
    },

    /**
     * Mints a fresh non-transferable voting NFT through the connected treasury
     * administrator wallet, waits for confirmation, and reports the confirmed
     * token ID, live supply, and holder credentials.
     */
    async mintVotingNft(request: MintVotingNftRequest): Promise<MintVotingNftResult> {
      if (!membershipChain || !membershipConfig) {
        return {
          status: 'unconfigured',
          message: 'Voting NFT minting requires a configured DAO deployment and RPC endpoint.',
        }
      }
      if (!isAddress(request.treasury)) {
        return { status: 'not-found', address: request.treasury, reason: 'invalid-address' }
      }
      if (!adapter) {
        return {
          status: 'wallet-unavailable',
          message: 'No wallet extension is available to sign the mint transaction.',
        }
      }

      let prepared
      try {
        prepared = await this.prepareDeploymentAction({ target: request.treasury })
      } catch (err) {
        return toPreparedActionFailure(err)
      }

      try {
        prepared.assertValid()
        const outcome = await mintVotingNft(membershipChain, membershipConfig, {
          from: prepared.context.account,
          treasury: request.treasury,
          holder: request.holder,
          assertValid: prepared.assertValid,
        })
        if (outcome.status === 'unknown-treasury') {
          return isAddress(outcome.treasury)
            ? { status: 'not-found', address: outcome.treasury, reason: 'unregistered' }
            : { status: 'not-found', address: outcome.treasury, reason: 'invalid-address' }
        }
        return outcome
      } catch (err) {
        return toMintVotingNftFailure(err)
      }
    },

    async burnVotingNft(request: { treasury: string; tokenId: string }): Promise<BurnVotingNftResult> {
      if (!membershipChain || !membershipConfig) return {
        status: 'unconfigured', message: 'Burning requires a configured DAO deployment and RPC endpoint.',
      }
      if (!isAddress(request.treasury)) return {
        status: 'not-found', address: request.treasury, reason: 'invalid-address',
      }
      if (!adapter) return { status: 'wallet-unavailable', message: 'Connect a wallet to burn a credential.' }
      let prepared
      try {
        prepared = await this.prepareDeploymentAction({ target: request.treasury })
      } catch (error) {
        return toPreparedActionFailure(error)
      }
      try {
        prepared.assertValid()
        const outcome = await burnVotingNft(membershipChain, membershipConfig, {
          ...request, from: prepared.context.account, assertValid: prepared.assertValid,
        })
        if (outcome.status === 'unknown-treasury') return {
          status: 'not-found', address: outcome.treasury, reason: 'unregistered',
        }
        return outcome
      } catch (error) {
        return toTransactionFailure(error, {
          ChainMismatchError: MembershipChainMismatchError,
          RevertedError: VotingNftBurnRevertedError,
          ConfirmationError: VotingNftConfirmationError,
          SubmissionError: VotingNftSubmissionError,
        }, {
          revertedMessage: 'The burn reverted on-chain. No credential was removed.',
          rpcUnavailableMessage: 'Burning could not reach the configured RPC endpoint.',
          rejectedMessage: 'The burn transaction was rejected in your wallet. Nothing was submitted.',
          submissionMessage: 'The burn transaction was not submitted.',
        })
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
