import { encodeAbiParameters, getAddress, sha256, type Address, type Hex } from 'viem'

/**
 * Event attendance credential derivation (spec 06, version 1).
 *
 * Frozen serialization, see docs/attendance-credentials.md:
 * - Signing method: EIP-191 personal_sign over the UTF-8 message bytes.
 * - Message: four lines joined by "\n", no trailing newline.
 * - Secret: sha256(abi.encode(bytes signature, uint256 proposalId)), where the
 *   signature is the wallet's 65-byte r||s||v output used exactly as returned.
 * - Entry: sha256(abi.encode(uint256 proposalId, bytes32 secret)).
 *
 * The secret and signature are never part of any public output.
 */
export const ATTENDANCE_MESSAGE_LABEL = 'DAO for Clubs attendance v1'
export const ATTENDANCE_QR_VERSION = 1

export interface AttendanceEvent {
  chainId: number
  daoAddress: Address
  proposalId: bigint
  credentialVersion?: 1 | 2
}

/** Canonical identity of an event: addresses compare case-insensitively. */
export function attendanceEventKey(event: AttendanceEvent): string {
  const key = `${event.chainId}:${event.daoAddress.toLowerCase()}:${event.proposalId}`
  return event.credentialVersion === 2 ? `${key}:v2` : key
}

export function sameAttendanceEvent(a: AttendanceEvent, b: AttendanceEvent): boolean {
  return attendanceEventKey(a) === attendanceEventKey(b)
}

export function attendanceSigningMessage(event: AttendanceEvent): string {
  return [
    ATTENDANCE_MESSAGE_LABEL,
    `Chain ID: ${event.chainId}`,
    `DAO: ${getAddress(event.daoAddress)}`,
    `Proposal ID: ${event.proposalId}`,
  ].join('\n')
}

const MAX_UINT256 = 2n ** 256n - 1n

/** True when the proposal ID fits the uint256 used in the ABI encodings. */
export function isAttendanceProposalId(proposalId: bigint): boolean {
  return proposalId >= 0n && proposalId <= MAX_UINT256
}

/** Thrown when the wallet's signature is not the expected 65-byte hex value. */
export class InvalidAttendanceSignatureError extends Error {
  constructor() {
    super('The wallet returned an unexpected signature format.')
  }
}

/**
 * Derives the public QR entry from the wallet signature. The intermediate
 * secret is computed and discarded here so it cannot leave this module.
 */
export function deriveAttendanceCredential(signature: Hex, proposalId: bigint): { entry: Hex } {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new InvalidAttendanceSignatureError()
  const secret = sha256(
    encodeAbiParameters([{ type: 'bytes' }, { type: 'uint256' }], [signature, proposalId]),
    'hex'
  )
  const entry = sha256(
    encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes32' }], [proposalId, secret]),
    'hex'
  )
  return { entry }
}

/**
 * Derives both the secret and the entry for the opt-in public-claim flow
 * (spec 09). Unlike `deriveAttendanceCredential`, this intentionally returns
 * the secret: public claiming discloses it on-chain by design. Only call
 * this after the holder has explicitly consented to permanent disclosure;
 * never log, persist, or transmit the result outside the claim payload.
 */
export function deriveAttendancePublicClaimWitness(signature: Hex, proposalId: bigint): { secret: Hex; entry: Hex } {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new InvalidAttendanceSignatureError()
  const secret = sha256(
    encodeAbiParameters([{ type: 'bytes' }, { type: 'uint256' }], [signature, proposalId]),
    'hex'
  )
  const entry = sha256(
    encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes32' }], [proposalId, secret]),
    'hex'
  )
  return { secret, entry }
}

export function encodeAttendanceQr(event: AttendanceEvent & { entry: Hex }): string {
  return JSON.stringify({
    v: ATTENDANCE_QR_VERSION,
    chainId: event.chainId,
    dao: getAddress(event.daoAddress),
    proposalId: event.proposalId.toString(),
    entry: event.entry,
  })
}
