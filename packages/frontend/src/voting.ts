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

export async function readVotingProgress(
  chain: ProposalChain, config: ProposalConfig, proposalId: bigint
): Promise<VotingProgress | null> {
  if (await readProposalTerms(chain, config, proposalId) === null) return null
  const [yesVotes, threshold, passed, open] = await chain.readContract<readonly [bigint, bigint, boolean, boolean]>({
    address: config.daoAddress, abi: config.daoAbi, functionName: 'getVoting', args: [proposalId],
  })
  return { proposalId, yesVotes, threshold, outcome: passed ? 'passed' : open ? 'open' : 'closed-without-passing' }
}

export async function castYesVote(
  chain: ProposalChain, config: ProposalConfig,
  input: { from: Address; proposalId: bigint; tokenId: bigint },
  assertValid: () => Promise<void>,
) {
  const actualChainId = await chain.getChainId()
  if (actualChainId !== config.chainId) throw new ProposalChainMismatchError(config.chainId, actualChainId)
  await assertValid()
  let hash: Hex
  try {
    hash = await chain.sendTransaction({
      from: input.from, address: config.daoAddress, abi: config.daoAbi,
      functionName: 'voteYes', args: [input.proposalId, input.tokenId],
    })
  } catch (error) {
    throw new VoteSubmissionError('The yes vote was not submitted.', error)
  }
  let receipt
  try { receipt = await chain.waitForTransactionReceipt(hash) }
  catch { throw new VoteConfirmationError('Vote submitted, but confirmation is unavailable. Check the transaction before retrying.', hash) }
  if (receipt.status !== 'success') throw new VoteRevertedError(hash)
  const confirmed = receipt.logs.some(log => {
    if (log.address.toLowerCase() !== config.daoAddress.toLowerCase()) return false
    try {
      const event = decodeEventLog({ abi: config.daoAbi, eventName: 'YesVoteCast', data: log.data, topics: log.topics as [Hex, ...Hex[]] })
      const args = event.args as unknown as { proposalId: bigint; tokenId: bigint; voter: Address }
      return args.proposalId === input.proposalId && args.tokenId === input.tokenId && args.voter.toLowerCase() === input.from.toLowerCase()
    } catch { return false }
  })
  if (!confirmed) throw new VoteConfirmationError('No matching yes ballot was found in the receipt.', hash)
  // A failed refresh must not turn a confirmed ballot into an apparent failed submission.
  try {
    return { status: 'confirmed' as const, hash, progress: await readVotingProgress(chain, config, input.proposalId) }
  } catch {
    return { status: 'confirmed' as const, hash, progress: null }
  }
}
