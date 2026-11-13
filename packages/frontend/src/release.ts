import { decodeEventLog, type Address, type Hex } from 'viem'
import {
  ProposalChainMismatchError,
  readProposalTerms,
  type ProposalChain,
  type ProposalConfig,
} from './proposalCreation.js'

/**
 * Funding state of a proposal, kept separate from voting and attendance. All
 * of it is derived from chain state at read time, never from a stale estimate:
 * - `passed-awaiting-funds`: passing recorded, unpaid, treasury balance below the amount.
 * - `payment-pending`: passing recorded, unpaid, the balance covers the amount now; the
 *   creator's release request has not (yet) moved funds. Passing never reserves the balance.
 * - `payment-failed`: the latest release attempt found the balance sufficient but the asset
 *   refused the transfer. Still retryable.
 * - `paid`: TestUSD actually moved, exactly once.
 */
export interface ProposalFunding {
  proposalId: bigint
  amount: bigint
  recipient: Address
  state: 'not-passed' | 'passed-awaiting-funds' | 'payment-pending' | 'payment-failed' | 'paid'
}

const FUNDING_STATE_TEXT: Record<ProposalFunding['state'], string> = {
  'not-passed': 'Not passed: no funds can be released.',
  'passed-awaiting-funds': 'Passed; awaiting funds: the treasury balance is below the amount. Retry after it is replenished.',
  'payment-pending': 'Passed; the treasury can currently cover the amount, but it is not yet paid. Passing does not reserve funds.',
  'payment-failed': 'Passed; the last payment attempt failed because the funding asset refused the transfer. Retry is possible.',
  paid: 'Paid: funds were sent to the fixed recipient.',
}

/** States in which the creator's release request is offered; a new state is not releasable until added here. */
const RETRYABLE_STATES: ReadonlySet<ProposalFunding['state']> =
  new Set(['passed-awaiting-funds', 'payment-pending', 'payment-failed'])

/** What a funding read looks like to a user: status line and whether the release action is offered. */
export function describeFunding(funding: ProposalFunding): { statusText: string; canRelease: boolean } {
  return { statusText: FUNDING_STATE_TEXT[funding.state], canRelease: RETRYABLE_STATES.has(funding.state) }
}

export type ReleaseOutcome = 'confirmed' | 'funds-pending'
export type FundsPendingReason = 'insufficient-balance' | 'payment-failed'

export const CHAIN_MISMATCH_MESSAGE = 'Wallet and deployment chains must match.'

export function describeReleaseOutcome(outcome: ReleaseOutcome, hash: Hex, reason?: FundsPendingReason): string {
  if (outcome === 'confirmed') return `Payment confirmed: ${hash}`
  const cause = reason === 'payment-failed'
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
  const [passingRecorded, paid, paymentFailed, treasuryBalance] = await Promise.all([
    readPassingRecorded(chain, config, proposalId),
    read<boolean>('fundsReleased'),
    read<boolean>('paymentFailed'),
    chain.readContract<bigint>({ address: config.testUsdAddress, abi: config.testUsdAbi, functionName: 'balanceOf', args: [terms.treasury] }),
  ])
  const state: ProposalFunding['state'] = paid ? 'paid'
    : !passingRecorded ? 'not-passed'
    : treasuryBalance < terms.amount ? 'passed-awaiting-funds'
    : paymentFailed ? 'payment-failed' : 'payment-pending'
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
    ? (emitted('FundsTransferFailed') ? 'payment-failed' : 'insufficient-balance') : undefined
  // A failed refresh must not change what the receipt already established.
  try {
    return { status, hash, reason, funding: await readProposalFunding(chain, config, input.proposalId) }
  } catch {
    return { status, hash, reason, funding: null }
  }
}
