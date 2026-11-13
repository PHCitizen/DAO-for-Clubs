import { decodeEventLog, type Address, type Hex } from 'viem'
import {
  ProposalChainMismatchError,
  readProposalTerms,
  type ProposalChain,
  type ProposalConfig,
} from './proposalCreation.js'

export interface VotingProgress {
  proposalId: bigint
  yesVotes: bigint
  noVotes: bigint
  threshold: bigint
  outcome: 'open' | 'passed' | 'closed-without-passing'
}

export class VoteSubmissionError extends Error {
  constructor(message: string, readonly cause: unknown) { super(message) }
}
export class VoteRevertedError extends Error {
  constructor(readonly hash: Hex) { super('The vote reverted on-chain. No ballot was recorded.') }
}
export class VoteConfirmationError extends Error {
  constructor(message: string, readonly hash: Hex | null = null) { super(message) }
}

export class PassingCheckSubmissionError extends Error {
  constructor(message: string, readonly cause: unknown) { super(message) }
}
export class PassingCheckRevertedError extends Error {
  constructor(readonly hash: Hex) { super('The passing check reverted on-chain. No passing was recorded.') }
}
export class PassingCheckConfirmationError extends Error {
  constructor(message: string, readonly hash: Hex | null = null) { super(message) }
}

export async function readVotingProgress(
  chain: ProposalChain, config: ProposalConfig, proposalId: bigint
): Promise<VotingProgress | null> {
  if (await readProposalTerms(chain, config, proposalId) === null) return null
  const [yesVotes, threshold, passed, open, noVotes] = await chain.readContract<readonly [bigint, bigint, boolean, boolean, bigint]>({
    address: config.daoAddress, abi: config.daoAbi, functionName: 'getVoting', args: [proposalId],
  })
  return { proposalId, yesVotes, noVotes, threshold, outcome: passed ? 'passed' : open ? 'open' : 'closed-without-passing' }
}

export async function castVote(
  chain: ProposalChain, config: ProposalConfig,
  input: { from: Address; proposalId: bigint; tokenId: bigint; choice: 'yes' | 'no' },
  assertValid: () => Promise<void>,
) {
  const actualChainId = await chain.getChainId()
  if (actualChainId !== config.chainId) throw new ProposalChainMismatchError(config.chainId, actualChainId)
  await assertValid()
  let hash: Hex
  try {
    hash = await chain.sendTransaction({
      from: input.from, address: config.daoAddress, abi: config.daoAbi,
      functionName: input.choice === 'yes' ? 'voteYes' : 'voteNo', args: [input.proposalId, input.tokenId],
    })
  } catch (error) {
    throw new VoteSubmissionError(`The ${input.choice} vote was not submitted.`, error)
  }
  let receipt
  try { receipt = await chain.waitForTransactionReceipt(hash) }
  catch { throw new VoteConfirmationError('Vote submitted, but confirmation is unavailable. Check the transaction before retrying.', hash) }
  if (receipt.status !== 'success') throw new VoteRevertedError(hash)
  const confirmed = receipt.logs.some(log => {
    if (log.address.toLowerCase() !== config.daoAddress.toLowerCase()) return false
    try {
      const event = decodeEventLog({ abi: config.daoAbi, eventName: input.choice === 'yes' ? 'YesVoteCast' : 'NoVoteCast', data: log.data, topics: log.topics as [Hex, ...Hex[]] })
      if (event.eventName !== (input.choice === 'yes' ? 'YesVoteCast' : 'NoVoteCast')) return false
      const args = event.args as unknown as { proposalId: bigint; tokenId: bigint; voter: Address }
      return args.proposalId === input.proposalId && args.tokenId === input.tokenId && args.voter.toLowerCase() === input.from.toLowerCase()
    } catch { return false }
  })
  if (!confirmed) throw new VoteConfirmationError(`No matching ${input.choice} ballot was found in the receipt.`, hash)
  // A failed refresh must not turn a confirmed ballot into an apparent failed submission.
  try {
    return { status: 'confirmed' as const, hash, progress: await readVotingProgress(chain, config, input.proposalId) }
  } catch {
    return { status: 'confirmed' as const, hash, progress: null }
  }
}

/**
 * Permissionless passing check: records the same passing result as a
 * qualifying ballot without casting a new vote. Reusable once fund release
 * needs the identical check. Never implies a payout or administrative
 * approval; it only evaluates and records the existing-vote threshold.
 */
export async function checkProposalPassing(
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
      functionName: 'checkPassing', args: [input.proposalId],
    })
  } catch (error) {
    throw new PassingCheckSubmissionError('The passing check was not submitted.', error)
  }
  let receipt
  try { receipt = await chain.waitForTransactionReceipt(hash) }
  catch { throw new PassingCheckConfirmationError('Passing check submitted, but confirmation is unavailable. Check the transaction before retrying.', hash) }
  if (receipt.status !== 'success') throw new PassingCheckRevertedError(hash)
  const confirmed = receipt.logs.some(log => {
    if (log.address.toLowerCase() !== config.daoAddress.toLowerCase()) return false
    try {
      const event = decodeEventLog({ abi: config.daoAbi, eventName: 'ProposalPassed', data: log.data, topics: log.topics as [Hex, ...Hex[]] })
      const args = event.args as unknown as { proposalId: bigint }
      return args.proposalId === input.proposalId
    } catch { return false }
  })
  if (!confirmed) throw new PassingCheckConfirmationError('No matching passing event was found in the receipt.', hash)
  // A failed refresh must not turn a confirmed check into an apparent failed submission.
  try {
    return { status: 'confirmed' as const, hash, progress: await readVotingProgress(chain, config, input.proposalId) }
  } catch {
    return { status: 'confirmed' as const, hash, progress: null }
  }
}
