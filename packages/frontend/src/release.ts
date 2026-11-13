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

export class FundReleaseSubmissionError extends Error {
  constructor(message: string, readonly cause: unknown) { super(message) }
}
export class FundReleaseRevertedError extends Error {
  constructor(readonly hash: Hex) { super('The fund release reverted on-chain. Nothing was paid.') }
}
export class FundReleaseConfirmationError extends Error {
  constructor(message: string, readonly hash: Hex | null = null) { super(message) }
}

export async function readProposalFunding(
  chain: ProposalChain, config: ProposalConfig, proposalId: bigint
): Promise<ProposalFunding | null> {
  const terms = await readProposalTerms(chain, config, proposalId)
  if (terms === null) return null
  const read = <T>(functionName: string) => chain.readContract<T>({
    address: config.daoAddress, abi: config.daoAbi, functionName, args: [proposalId],
  })
  const [voting, paid] = await Promise.all([
    read<readonly [bigint, bigint, boolean, boolean, bigint]>('getVoting'),
    read<boolean>('fundsReleased'),
  ])
  const state = paid ? 'paid' : voting[2] ? 'passed-awaiting-funds' : 'not-passed'
  return { proposalId, amount: terms.amount, recipient: terms.payoutRecipient, state }
}

/**
 * Asks the DAO to pay a passed proposal to its fixed recipient. A successful
 * receipt is not proof of payment: only a matching `FundsReleased` event is
 * reported as `confirmed`; a `FundingShortage` event is `funds-pending`.
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

  const matching = (eventName: 'FundsReleased' | 'FundingShortage') => receipt.logs.some(log => {
    if (log.address.toLowerCase() !== config.daoAddress.toLowerCase()) return false
    try {
      const event = decodeEventLog({ abi: config.daoAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] })
      if (event.eventName !== eventName) return false
      return (event.args as unknown as { proposalId: bigint }).proposalId === input.proposalId
    } catch { return false }
  })
  const status = matching('FundsReleased') ? 'confirmed' as const
    : matching('FundingShortage') ? 'funds-pending' as const : null
  if (status === null) throw new FundReleaseConfirmationError('No matching release or funding-shortage event was found in the receipt.', hash)
  // A failed refresh must not change what the receipt already established.
  try {
    return { status, hash, funding: await readProposalFunding(chain, config, input.proposalId) }
  } catch {
    return { status, hash, funding: null }
  }
}
