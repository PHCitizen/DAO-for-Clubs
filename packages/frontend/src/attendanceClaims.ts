import { decodeEventLog, getAddress, type Abi, type Address, type Hex } from 'viem'
import { type ProposalChain } from './proposalCreation.js'
import { attendanceMerkleProof, verifyAttendanceMerkleProof } from './attendanceMerkle.js'

/**
 * Opt-in public attendance claims (spec 09): prepare a disclosure witness,
 * submit a unique on-chain claim, and browse confirmed claims. This is a
 * development fixture built against the frozen v1 credential format and a
 * POC Merkle convention; it is not the TODO-01-approved canonical
 * cryptographic format. See `AttendanceClaims.sol` and
 * `attendanceMerkle.ts` for the exact scope of that gap.
 */

export interface AttendanceClaimsConfig {
  chainId: number
  attendanceClaimsAddress: Address
  attendanceClaimsAbi: Abi
}

export class AttendanceClaimsChainMismatchError extends Error {
  readonly kind = 'attendance-claims-chain-mismatch' as const
  constructor(readonly expectedChainId: number, readonly actualChainId: number) {
    super(`Public attendance claims require chain ${expectedChainId}, but the RPC endpoint reported chain ${actualChainId}.`)
    this.name = 'AttendanceClaimsChainMismatchError'
  }
}

export class PublicClaimSubmissionError extends Error {
  constructor(message: string, readonly cause: unknown) { super(message) }
}
export class PublicClaimRevertedError extends Error {
  constructor(readonly hash: Hex) { super('The public claim reverted on-chain. No association was recorded.') }
}
export class PublicClaimConfirmationError extends Error {
  constructor(message: string, readonly hash: Hex | null = null) { super(message) }
}

async function assertDeploymentChain(chain: ProposalChain, config: AttendanceClaimsConfig): Promise<void> {
  const actualChainId = await chain.getChainId()
  if (actualChainId !== config.chainId) throw new AttendanceClaimsChainMismatchError(config.chainId, actualChainId)
}

/** The event's finalized root, or `null` while finalization (fixture for spec 07) is still pending. */
export async function readAttendanceRoot(
  chain: ProposalChain, config: AttendanceClaimsConfig, proposalId: bigint
): Promise<Hex | null> {
  await assertDeploymentChain(chain, config)
  const finalized = await chain.readContract<boolean>({
    address: config.attendanceClaimsAddress, abi: config.attendanceClaimsAbi,
    functionName: 'attendanceFinalized', args: [proposalId],
  })
  if (!finalized) return null
  return chain.readContract<Hex>({
    address: config.attendanceClaimsAddress, abi: config.attendanceClaimsAbi,
    functionName: 'attendanceRoot', args: [proposalId],
  })
}

export async function isPublicAttendanceEntryConsumed(
  chain: ProposalChain, config: AttendanceClaimsConfig, proposalId: bigint, entry: Hex
): Promise<boolean> {
  await assertDeploymentChain(chain, config)
  return chain.readContract<boolean>({
    address: config.attendanceClaimsAddress, abi: config.attendanceClaimsAbi,
    functionName: 'entryConsumed', args: [proposalId, entry],
  })
}

export type PreparedPublicAttendanceClaim =
  | { status: 'not-finalized' }
  | { status: 'not-a-member' }
  | { status: 'already-consumed' }
  | { status: 'ready'; proposalId: bigint; secret: Hex; entry: Hex; proof: Hex[]; root: Hex }

/**
 * Builds and locally verifies the on-chain witness for a disclosure the
 * holder has already explicitly consented to. Requires the organizer's full
 * published entry list (the spec 07 substitute transport for this fixture,
 * e.g. the local export from `attendanceStorage.ts`) because no production
 * publication pipeline exists yet. Never persists or logs `secret`.
 */
export async function preparePublicAttendanceClaim(
  chain: ProposalChain, config: AttendanceClaimsConfig,
  input: { proposalId: bigint; secret: Hex; entry: Hex; publishedEntries: readonly Hex[] },
): Promise<PreparedPublicAttendanceClaim> {
  const root = await readAttendanceRoot(chain, config, input.proposalId)
  if (root === null) return { status: 'not-finalized' }
  if (await isPublicAttendanceEntryConsumed(chain, config, input.proposalId, input.entry)) {
    return { status: 'already-consumed' }
  }
  let proof: Hex[]
  try {
    proof = attendanceMerkleProof(input.publishedEntries, input.entry)
  } catch {
    return { status: 'not-a-member' }
  }
  if (!verifyAttendanceMerkleProof(input.entry, proof, root)) return { status: 'not-a-member' }
  return { status: 'ready', proposalId: input.proposalId, secret: input.secret, entry: input.entry, proof, root }
}

type ClaimEventName = 'PublicAttendanceClaimed'

function receiptHasClaim(
  logs: readonly { address: string; data: Hex; topics: readonly Hex[] }[],
  config: AttendanceClaimsConfig, proposalId: bigint, from: Address,
): boolean {
  return logs.some(log => {
    if (log.address.toLowerCase() !== config.attendanceClaimsAddress.toLowerCase()) return false
    try {
      const event = decodeEventLog({ abi: config.attendanceClaimsAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] })
      if (event.eventName !== ('PublicAttendanceClaimed' satisfies ClaimEventName)) return false
      const args = event.args as unknown as { proposalId: bigint; claimant: Address }
      return args.proposalId === proposalId && args.claimant.toLowerCase() === from.toLowerCase()
    } catch { return false }
  })
}

/**
 * Submits a prepared disclosure claim. The caller must have already shown
 * the irreversibility, observer-private-proof, and front-running warnings
 * and obtained explicit consent (`consent: true`) before calling this.
 */
export async function submitPublicAttendanceClaim(
  chain: ProposalChain, config: AttendanceClaimsConfig,
  input: { from: Address; proposalId: bigint; secret: Hex; proof: Hex[]; consent: true },
  assertValid: () => Promise<void>,
) {
  await assertDeploymentChain(chain, config)
  await assertValid()
  let hash: Hex
  try {
    hash = await chain.sendTransaction({
      from: input.from, address: config.attendanceClaimsAddress, abi: config.attendanceClaimsAbi,
      functionName: 'claimPublicAttendance', args: [input.proposalId, input.secret, input.proof],
    })
  } catch (error) {
    throw new PublicClaimSubmissionError('The public claim was not submitted.', error)
  }
  let receipt
  try { receipt = await chain.waitForTransactionReceipt(hash) }
  catch { throw new PublicClaimConfirmationError('Claim submitted, but confirmation is unavailable. Check the transaction before retrying.', hash) }
  if (receipt.status !== 'success') throw new PublicClaimRevertedError(hash)
  if (!receiptHasClaim(receipt.logs, config, input.proposalId, input.from)) {
    throw new PublicClaimConfirmationError('No matching public-claim event was found in the receipt.', hash)
  }
  return { status: 'confirmed' as const, hash }
}

export interface PublicAttendanceClaim {
  proposalId: bigint
  claimant: Address
  entry: Hex
}

/** Rebuilds confirmed claims for one event directly from logs: no backend indexer. */
export async function readPublicAttendanceClaimsByEvent(
  chain: ProposalChain, config: AttendanceClaimsConfig, proposalId: bigint
): Promise<PublicAttendanceClaim[]> {
  await assertDeploymentChain(chain, config)
  if (!chain.getLogs) throw new Error('This transport cannot query historical logs.')
  const logs = await chain.getLogs({
    address: config.attendanceClaimsAddress, abi: config.attendanceClaimsAbi, eventName: 'PublicAttendanceClaimed',
    args: { proposalId }, fromBlock: 0n, toBlock: 'latest',
  })
  return logs.map(log => ({
    proposalId: BigInt(log.args.proposalId as bigint),
    claimant: getAddress(log.args.claimant as string),
    entry: log.args.entry as Hex,
  }))
}

/** Rebuilds confirmed claims for one wallet across every event, from logs only. */
export async function readPublicAttendanceClaimsByWallet(
  chain: ProposalChain, config: AttendanceClaimsConfig, claimant: Address
): Promise<PublicAttendanceClaim[]> {
  await assertDeploymentChain(chain, config)
  if (!chain.getLogs) throw new Error('This transport cannot query historical logs.')
  const logs = await chain.getLogs({
    address: config.attendanceClaimsAddress, abi: config.attendanceClaimsAbi, eventName: 'PublicAttendanceClaimed',
    args: { claimant }, fromBlock: 0n, toBlock: 'latest',
  })
  return logs.map(log => ({
    proposalId: BigInt(log.args.proposalId as bigint),
    claimant: getAddress(log.args.claimant as string),
    entry: log.args.entry as Hex,
  }))
}

/** Finalizes the organizer-supplied root (fixture substitute for spec 07's publication pipeline). */
export async function finalizeAttendanceRoot(
  chain: ProposalChain, config: AttendanceClaimsConfig,
  input: { from: Address; proposalId: bigint; root: Hex },
  assertValid: () => Promise<void>,
) {
  await assertDeploymentChain(chain, config)
  await assertValid()
  let hash: Hex
  try {
    hash = await chain.sendTransaction({
      from: input.from, address: config.attendanceClaimsAddress, abi: config.attendanceClaimsAbi,
      functionName: 'finalizeAttendanceRoot', args: [input.proposalId, input.root],
    })
  } catch (error) {
    throw new PublicClaimSubmissionError('Root finalization was not submitted.', error)
  }
  let receipt
  try { receipt = await chain.waitForTransactionReceipt(hash) }
  catch { throw new PublicClaimConfirmationError('Finalization submitted, but confirmation is unavailable. Check the transaction before retrying.', hash) }
  if (receipt.status !== 'success') throw new PublicClaimRevertedError(hash)
  return { status: 'confirmed' as const, hash }
}
