import { getAddress, type Abi, type Address } from 'viem'
import { ProposalChainMismatchError, type ProposalChain, type ProposalConfig } from './proposalCreation.js'

/**
 * Public ballot inspection, derived from `YesVoteCast`/`NoVoteCast` logs.
 *
 * There is no backend indexer: ballots are rebuilt by querying the DAO's
 * event logs directly through the RPC adapter. Because the log record is
 * append-only and independent of current token ownership, a ballot tied to
 * a since-burned token still appears here — burning changes live supply
 * (and therefore the threshold) but never rewrites a cast vote.
 */
export interface Ballot {
  tokenId: bigint
  voter: Address
  choice: 'yes' | 'no'
}

export interface BallotLogRequest {
  address: Address
  abi: Abi
  eventName: string
  args?: Record<string, unknown>
  fromBlock?: bigint
  toBlock?: bigint | 'latest'
}

export interface BallotLog {
  args: Record<string, unknown>
}

export interface BallotLogsChain {
  getLogs(request: BallotLogRequest): Promise<BallotLog[]>
}

async function assertDeploymentChain(chain: ProposalChain, config: ProposalConfig): Promise<void> {
  const actualChainId = await chain.getChainId()
  if (actualChainId !== config.chainId) {
    throw new ProposalChainMismatchError(config.chainId, actualChainId)
  }
}

function toBallots(logs: BallotLog[], choice: 'yes' | 'no'): Ballot[] {
  return logs.map(log => ({
    tokenId: BigInt(log.args.tokenId as bigint),
    voter: getAddress(log.args.voter as string),
    choice,
  }))
}

/**
 * Lists every public ballot cast for a proposal, oldest first within each
 * choice, by querying event logs rather than any mutable mapping. Honest
 * about transport: an unreachable RPC throws (mapped by the caller to a
 * `rpc-unavailable` read result), never a silently empty list.
 */
export async function readPublicBallots(
  chain: ProposalChain & BallotLogsChain,
  config: ProposalConfig,
  proposalId: bigint
): Promise<Ballot[]> {
  await assertDeploymentChain(chain, config)
  const [yesLogs, noLogs] = await Promise.all([
    chain.getLogs({
      address: config.daoAddress, abi: config.daoAbi, eventName: 'YesVoteCast',
      args: { proposalId }, fromBlock: 0n, toBlock: 'latest',
    }),
    chain.getLogs({
      address: config.daoAddress, abi: config.daoAbi, eventName: 'NoVoteCast',
      args: { proposalId }, fromBlock: 0n, toBlock: 'latest',
    }),
  ])
  return [...toBallots(yesLogs, 'yes'), ...toBallots(noLogs, 'no')]
}
