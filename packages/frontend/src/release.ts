import { decodeEventLog, type Address, type Hex } from 'viem'
import {
  ProposalChainMismatchError,
  readProposalTerms,
  type ProposalChain,
  type ProposalConfig,
} from './proposalCreation.js'

/**
 * Funding state of a proposal, kept separate from voting and attendance.
 * `passed-awaiting-funds` means passing is recorded but no TestUSD has moved.
 */
export interface ProposalFunding {
  proposalId: bigint
  amount: bigint
  recipient: Address
  state: 'not-passed' | 'passed-awaiting-funds' | 'paid'
}

const FUNDING_STATE_TEXT: Record<ProposalFunding['state'], string> = {
  'not-passed': 'Not passed: no funds can be released.',
  'passed-awaiting-funds': 'Passed; not yet paid.',
  paid: 'Paid: funds were sent to the fixed recipient.',
}

/** What a funding read looks like to a user: status line and whether the release action is offered. */
export function describeFunding(funding: ProposalFunding): { statusText: string; canRelease: boolean } {
  return { statusText: FUNDING_STATE_TEXT[funding.state], canRelease: funding.state === 'passed-awaiting-funds' }
}

export type ReleaseOutcome = 'confirmed' | 'funds-pending'
export type FundsPendingReason = 'insufficient-balance' | 'transfer-refused'

export const CHAIN_MISMATCH_MESSAGE = 'Wallet and deployment chains must match.'

export function describeReleaseOutcome(outcome: ReleaseOutcome, hash: Hex, reason?: FundsPendingReason): string {
  if (outcome === 'confirmed') return `Payment confirmed: ${hash}`
  const cause = reason === 'transfer-refused'
    ? 'the funding asset refused the transfer'
    : 'the treasury balance is insufficient'
  return `Not paid: ${cause}. Passing is kept; retry when it is resolved. (${hash})`
}

export class FundReleaseSubmissionError extends Error {
  constructor(message: string, readonly cause: unknown) { super(message) }
}
export class FundReleaseRevertedError extends Error {
  constructor(readonly hash: Hex) { super('The fund release reverted on-chain. Nothing was paid.') }
}
export class FundReleaseConfirmationError extends Error {
  constructor(message: string, readonly hash: Hex | null = null) { super(message) }
}

function readDao<T>(chain: ProposalChain, config: ProposalConfig, functionName: string, proposalId: bigint) {
  return chain.readContract<T>({ address: config.daoAddress, abi: config.daoAbi, functionName, args: [proposalId] })
}

/** `getVoting` returns (yesVotes, threshold, passingRecorded, open, noVotes); only the recorded passing matters here. */
async function readPassingRecorded(chain: ProposalChain, config: ProposalConfig, proposalId: bigint): Promise<boolean> {
  const [, , passingRecorded] = await readDao<readonly [bigint, bigint, boolean, boolean, bigint]>(chain, config, 'getVoting', proposalId)
  return passingRecorded
}

export async function readProposalFunding(
  chain: ProposalChain, config: ProposalConfig, proposalId: bigint
): Promise<ProposalFunding | null> {
  const terms = await readProposalTerms(chain, config, proposalId)
  if (terms === null) return null
  const read = <T>(functionName: string) => readDao<T>(chain, config, functionName, proposalId)
  const [passingRecorded, paid] = await Promise.all([
    readPassingRecorded(chain, config, proposalId),
    read<boolean>('fundsReleased'),
  ])
  const state = paid ? 'paid' : passingRecorded ? 'passed-awaiting-funds' : 'not-passed'
  return { proposalId, amount: terms.amount, recipient: terms.payoutRecipient, state }
}

type ReleaseEventName = 'FundsReleased' | 'FundingShortage' | 'FundsTransferFailed'

/** True if the receipt holds a DAO-emitted `eventName` for this proposal. */
function receiptHasEvent(
  logs: readonly { address: string; data: Hex; topics: readonly Hex[] }[],
  config: ProposalConfig, eventName: ReleaseEventName, proposalId: bigint,
): boolean {
  return logs.some(log => {
    if (log.address.toLowerCase() !== config.daoAddress.toLowerCase()) return false
    try {
      const event = decodeEventLog({ abi: config.daoAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] })
      if (event.eventName !== eventName) return false
      return (event.args as unknown as { proposalId: bigint }).proposalId === proposalId
    } catch { return false }
  })
}

/**
 * Asks the DAO to pay a passed proposal to its fixed recipient. A successful
 * receipt is not proof of payment: only a matching `FundsReleased` event is
 * reported as `confirmed`; `FundingShortage` (balance) or `FundsTransferFailed`
 * (asset refused the transfer) is `funds-pending`.
 */
export async function releaseProposalFunds(
  chain: ProposalChain, config: ProposalConfig,
  input: { from: Address; proposalId: bigint },
  assertValid: () => Promise<void>,
) {
  const actualChainId = await chain.getChainId()
  if (actualChainId !== config.chainId) throw new ProposalChainMismatchError(config.chainId, actualChainId)
  await assertValid()
  let hash: Hex
  try {
    hash = await chain.sendTransaction({
      from: input.from, address: config.daoAddress, abi: config.daoAbi,
      functionName: 'releaseFunds', args: [input.proposalId],
    })
  } catch (error) {
    throw new FundReleaseSubmissionError('The fund release was not submitted.', error)
  }
  let receipt
  try { receipt = await chain.waitForTransactionReceipt(hash) }
  catch { throw new FundReleaseConfirmationError('Fund release submitted, but confirmation is unavailable. Check the transaction before retrying.', hash) }
  if (receipt.status !== 'success') throw new FundReleaseRevertedError(hash)

  const emitted = (eventName: ReleaseEventName) => receiptHasEvent(receipt.logs, config, eventName, input.proposalId)
  const status: ReleaseOutcome | null = emitted('FundsReleased') ? 'confirmed'
    : emitted('FundingShortage') || emitted('FundsTransferFailed') ? 'funds-pending' : null
  if (status === null) throw new FundReleaseConfirmationError('No matching release or funding-shortage event was found in the receipt.', hash)
  const reason: FundsPendingReason | undefined = status === 'funds-pending'
    ? (emitted('FundsTransferFailed') ? 'transfer-refused' : 'insufficient-balance') : undefined
  // A failed refresh must not change what the receipt already established.
  try {
    return { status, hash, reason, funding: await readProposalFunding(chain, config, input.proposalId) }
  } catch {
    return { status, hash, reason, funding: null }
  }
}
