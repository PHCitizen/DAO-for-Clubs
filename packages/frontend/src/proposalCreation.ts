import {
  decodeEventLog,
  formatUnits,
  getAddress,
  isAddress,
  type Abi,
  type Address,
  type Hex,
} from 'viem'
import { parseTestUsdAmount } from './testusd.js'
import { parseIpfsReference } from './ipfs.js'

// ---------------------------------------------------------------------------
// Chain seam
// ---------------------------------------------------------------------------
//
// Reads use the public RPC endpoint; creation is always signed by the connected
// wallet. The same seam runs against a real local EVM in behavioral tests.

export interface ProposalReadRequest {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

export interface ProposalWriteRequest extends ProposalReadRequest {
  from: Address
}

export interface ProposalTransactionLog {
  address: Address
  data: Hex
  topics: readonly Hex[]
}

export interface ProposalTransactionReceipt {
  status: 'success' | 'reverted'
  blockNumber: bigint
  logs: readonly ProposalTransactionLog[]
}

export interface ProposalChain {
  getChainId(): Promise<number>
  readContract<T = unknown>(request: ProposalReadRequest): Promise<T>
  sendTransaction(request: ProposalWriteRequest): Promise<Hex>
  waitForTransactionReceipt(hash: Hex): Promise<ProposalTransactionReceipt>
}

export interface ProposalConfig {
  chainId: number
  daoAddress: Address
  testUsdAddress: Address
  daoAbi: Abi
  testUsdAbi: Abi
}

// ---------------------------------------------------------------------------
// Immutable proposal terms
// ---------------------------------------------------------------------------

/** On-chain proposal record; also the interface for voting/payouts/attendance. */
export interface ProposalTerms {
  id: bigint
  treasury: Address
  creator: Address
  amount: bigint
  payoutRecipient: Address
  votingDeadline: bigint
  documentReference: string
}

export class ProposalChainMismatchError extends Error {
  readonly kind = 'proposal-chain-mismatch' as const
  constructor(
    readonly expectedChainId: number,
    readonly actualChainId: number
  ) {
    super(
      `Proposal operations require chain ${expectedChainId}, but the RPC endpoint reported chain ${actualChainId}.`
    )
    this.name = 'ProposalChainMismatchError'
  }
}

export class ProposalSubmissionError extends Error {
  readonly kind = 'proposal-submission-error' as const
  constructor(
    message: string,
    readonly cause: unknown
  ) {
    super(message)
    this.name = 'ProposalSubmissionError'
  }
}

export class ProposalRevertedError extends Error {
  readonly kind = 'proposal-reverted' as const
  constructor(readonly hash: Hex) {
    super('The proposal transaction was confirmed but reverted on-chain. No proposal was created.')
    this.name = 'ProposalRevertedError'
  }
}

export class ProposalConfirmationError extends Error {
  readonly kind = 'proposal-confirmation-error' as const
  constructor(
    message: string,
    readonly hash: Hex | null = null
  ) {
    super(message)
    this.name = 'ProposalConfirmationError'
  }
}

async function assertDeploymentChain(chain: ProposalChain, config: ProposalConfig): Promise<void> {
  const actualChainId = await chain.getChainId()
  if (actualChainId !== config.chainId) {
    throw new ProposalChainMismatchError(config.chainId, actualChainId)
  }
}

// ---------------------------------------------------------------------------
// Read interface
// ---------------------------------------------------------------------------

function mapProposal(raw: {
  id: bigint
  treasury: Address
  creator: Address
  amount: bigint
  payoutRecipient: Address
  votingDeadline: bigint
  documentReference: string
}): ProposalTerms {
  return {
    id: BigInt(raw.id),
    treasury: getAddress(raw.treasury),
    creator: getAddress(raw.creator),
    amount: BigInt(raw.amount),
    payoutRecipient: getAddress(raw.payoutRecipient),
    votingDeadline: BigInt(raw.votingDeadline),
    documentReference: raw.documentReference,
  }
}

export async function readProposalCount(chain: ProposalChain, config: ProposalConfig): Promise<bigint> {
  await assertDeploymentChain(chain, config)
  const count = await chain.readContract<bigint>({
    address: config.daoAddress,
    abi: config.daoAbi,
    functionName: 'proposalCount',
  })
  return BigInt(count)
}

/** Returns the recorded terms, or null when the DAO has no such proposal ID. */
export async function readProposalTerms(
  chain: ProposalChain,
  config: ProposalConfig,
  id: bigint
): Promise<ProposalTerms | null> {
  await assertDeploymentChain(chain, config)
  if (id <= 0n) return null
  const count = await readProposalCount(chain, config)
  if (id > count) return null

  const raw = await chain.readContract<{
    id: bigint
    treasury: Address
    creator: Address
    amount: bigint
    payoutRecipient: Address
    votingDeadline: bigint
    documentReference: string
  }>({
    address: config.daoAddress,
    abi: config.daoAbi,
    functionName: 'getProposal',
    args: [id],
  })
  return mapProposal(raw)
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface CreateProposalInput {
  from: Address
  treasury: string
  /** Human-readable TestUSD amount, parsed with the token's actual decimals. */
  amount: string
  /** Unix timestamp in seconds. */
  votingDeadline: number
  /** Prepared `ipfs://` reference for the pinned document. */
  documentReference: string
}

export type CreateProposalOutcome =
  | {
      status: 'success'
      chainId: number
      hash: Hex
      blockNumber: bigint
      proposal: ProposalTerms
      formattedAmount: string
      symbol: string
      decimals: number
    }
  | { status: 'invalid-treasury'; message: string }
  | { status: 'unregistered-treasury'; message: string }
  | { status: 'invalid-amount'; message: string }
  | { status: 'invalid-deadline'; message: string }
  | { status: 'invalid-reference'; message: string }

function findCreatedProposalId(
  receipt: ProposalTransactionReceipt,
  config: ProposalConfig
): bigint | null {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.daoAddress.toLowerCase()) continue
    try {
      const decoded = decodeEventLog({
        abi: config.daoAbi,
        eventName: 'ProposalCreated',
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      })
      const args = decoded.args as unknown as { id: bigint }
      return BigInt(args.id)
    } catch {
      // Ignore unrelated logs.
    }
  }
  return null
}

export async function createProposalOnChain(
  chain: ProposalChain,
  config: ProposalConfig,
  input: CreateProposalInput,
  hooks?: { onSubmitted?: (hash: Hex) => void }
): Promise<CreateProposalOutcome> {
  if (!isAddress(input.treasury)) {
    return { status: 'invalid-treasury', message: 'Enter a valid treasury address.' }
  }
  const treasury = getAddress(input.treasury)

  if (parseIpfsReference(input.documentReference) === null) {
    return {
      status: 'invalid-reference',
      message: 'A valid pinned ipfs:// document reference is required.',
    }
  }

  if (!Number.isSafeInteger(input.votingDeadline) || input.votingDeadline <= 0) {
    return { status: 'invalid-deadline', message: 'Enter a valid voting deadline.' }
  }
  if (input.votingDeadline <= Math.floor(Date.now() / 1000)) {
    return { status: 'invalid-deadline', message: 'The voting deadline must be in the future.' }
  }

  await assertDeploymentChain(chain, config)

  const isRegistered = await chain.readContract<boolean>({
    address: config.daoAddress,
    abi: config.daoAbi,
    functionName: 'isTreasury',
    args: [treasury],
  })
  if (!isRegistered) {
    return {
      status: 'unregistered-treasury',
      message: 'That address is not a treasury registered by this DAO.',
    }
  }

  const [decimals, symbol] = await Promise.all([
    chain.readContract<number>({
      address: config.testUsdAddress,
      abi: config.testUsdAbi,
      functionName: 'decimals',
    }),
    chain.readContract<string>({
      address: config.testUsdAddress,
      abi: config.testUsdAbi,
      functionName: 'symbol',
    }),
  ])
  const tokenDecimals = Number(decimals)

  const parsed = parseTestUsdAmount(input.amount, tokenDecimals)
  if (!parsed.ok) return { status: 'invalid-amount', message: parsed.message }

  const deadline = BigInt(input.votingDeadline)

  let hash: Hex
  try {
    hash = await chain.sendTransaction({
      from: getAddress(input.from),
      address: config.daoAddress,
      abi: config.daoAbi,
      functionName: 'createProposal',
      args: [treasury, parsed.amount, deadline, input.documentReference],
    })
    hooks?.onSubmitted?.(hash)
  } catch (error) {
    throw new ProposalSubmissionError(
      `The proposal transaction was not submitted: ${error instanceof Error ? error.message : String(error)}`,
      error
    )
  }

  let receipt: ProposalTransactionReceipt
  try {
    receipt = await chain.waitForTransactionReceipt(hash)
  } catch (error) {
    throw new ProposalConfirmationError(
      `The proposal transaction was submitted but could not be confirmed: ${error instanceof Error ? error.message : String(error)}`,
      hash
    )
  }

  if (receipt.status !== 'success') throw new ProposalRevertedError(hash)

  const id = findCreatedProposalId(receipt, config)
  if (id === null) {
    throw new ProposalConfirmationError(
      'The transaction succeeded but no ProposalCreated event was found.',
      hash
    )
  }

  // Confirm the actual assigned ID and the recorded immutable terms rather
  // than assuming the requested values were stored.
  const proposal = await readProposalTerms(chain, config, id)
  if (proposal === null) {
    throw new ProposalConfirmationError('The assigned proposal could not be read back.', hash)
  }
  const creator = getAddress(input.from)
  const termsMatch =
    proposal.treasury.toLowerCase() === treasury.toLowerCase() &&
    proposal.creator.toLowerCase() === creator.toLowerCase() &&
    proposal.payoutRecipient.toLowerCase() === creator.toLowerCase() &&
    proposal.amount === parsed.amount &&
    proposal.votingDeadline === deadline &&
    proposal.documentReference === input.documentReference
  if (!termsMatch) {
    throw new ProposalConfirmationError(
      'The recorded proposal terms do not match the requested creation.',
      hash
    )
  }

  return {
    status: 'success',
    chainId: config.chainId,
    hash,
    blockNumber: receipt.blockNumber,
    proposal,
    formattedAmount: formatUnits(proposal.amount, tokenDecimals),
    symbol,
    decimals: tokenDecimals,
  }
}
