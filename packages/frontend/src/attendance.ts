import { encodeAbiParameters, getAddress, sha256, type Hex } from 'viem'

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
  daoAddress: string
  proposalId: bigint
}

export function attendanceSigningMessage(event: AttendanceEvent): string {
  return [
    ATTENDANCE_MESSAGE_LABEL,
    `Chain ID: ${event.chainId}`,
    `DAO: ${getAddress(event.daoAddress)}`,
    `Proposal ID: ${event.proposalId}`,
  ].join('\n')
}

export function deriveAttendanceSecret(signature: Hex, proposalId: bigint): Hex {
  return sha256(
    encodeAbiParameters(
      [{ type: 'bytes' }, { type: 'uint256' }],
      [signature, proposalId]
    ),
    'hex'
  )
}

export function deriveAttendanceEntry(proposalId: bigint, secret: Hex): Hex {
  return sha256(
    encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes32' }], [proposalId, secret]),
    'hex'
  )
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
