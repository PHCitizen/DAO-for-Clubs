import type { Hex } from 'viem'
import {
  ATTENDANCE_V2_VERSION,
  InvalidAttendanceV2EncodingError,
  encodeCanonicalUint256,
  encodeDao,
  encodeField,
  parseCanonicalUint256,
  parseDao,
  parseField,
  type AttendanceV2Event,
  type AttendanceV2Witness,
} from './attendanceV2.js'

/**
 * Private attendance presentations (spec 08).
 *
 * A presentation is an off-chain, wallet-free artifact: an opaque proof from a
 * transparent proof system plus the public statement it proves. The file is
 * never authoritative: a verifier derives the statement from the configured
 * chain/DAO and only then asks the application-trusted proof system to verify
 * the proof bytes.
 *
 * The proof file deliberately contains no secret, signature, wallet address,
 * selected leaf, membership path or entry identifier.
 */

export const ATTENDANCE_PRESENTATION_SCHEMA = 'attendance-presentation/v2'

/** Versioned proof configuration identifier; extend only with a reviewed format. */
export const TRUSTED_PROOF_SYSTEMS = ['provekit-whir-v1'] as const
export type TrustedProofSystemId = (typeof TRUSTED_PROOF_SYSTEMS)[number]

export interface AttendanceProofStatement {
  context: Hex
  count: number
  root: Hex
}

/**
 * Trusted prover/verifier seam. The concrete browser adapter owns the pinned
 * ProveKit runtime and proving/verification keys; artifacts are application
 * configuration, never read from an imported file.
 */
export interface AttendanceProofSystem {
  readonly id: TrustedProofSystemId
  /** Generates real proof bytes from the local private witness. */
  prove(witness: AttendanceV2Witness): Promise<Uint8Array>
  /** Verifies proof bytes against an authenticated statement. */
  verify(proof: Uint8Array, statement: AttendanceProofStatement): Promise<boolean>
}

export interface PrivatePresentationFile {
  schema: typeof ATTENDANCE_PRESENTATION_SCHEMA
  chainId: string
  dao: string
  proposalId: string
  credentialVersion: number
  proofSystem: TrustedProofSystemId
  statement: AttendanceProofStatement
  proof: string
}

export interface ParsedPrivatePresentation {
  event: AttendanceV2Event
  credentialVersion: number
  proofSystem: TrustedProofSystemId
  statement: AttendanceProofStatement
  proof: Uint8Array
}

export class UnsupportedPresentationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedPresentationError'
  }
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeBase64(value: string): Uint8Array {
  if (!BASE64.test(value)) throw new UnsupportedPresentationError('The proof payload is not valid base64.')
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function presentationDocument(
  event: AttendanceV2Event,
  proofSystem: TrustedProofSystemId,
  statement: AttendanceProofStatement,
  proof: string,
): PrivatePresentationFile {
  return {
    schema: ATTENDANCE_PRESENTATION_SCHEMA,
    chainId: encodeCanonicalUint256(BigInt(event.chainId)),
    dao: encodeDao(event.daoAddress),
    proposalId: encodeCanonicalUint256(event.proposalId),
    credentialVersion: ATTENDANCE_V2_VERSION,
    proofSystem,
    statement: {
      context: encodeField(parseField(statement.context)),
      count: statement.count,
      root: encodeField(parseField(statement.root)),
    },
    proof,
  }
}

/** Serializes the agreed versioned proof file as compact canonical JSON. */
export function encodePrivatePresentation(
  event: AttendanceV2Event,
  proofSystem: TrustedProofSystemId,
  statement: AttendanceProofStatement,
  proof: Uint8Array,
): string {
  if (proof.length === 0) throw new UnsupportedPresentationError('The proof payload is empty.')
  return JSON.stringify(presentationDocument(event, proofSystem, statement, encodeBase64(proof)))
}

/** Parses a proof file, rejecting unsupported versions and malformed content. */
export function decodePrivatePresentation(payload: string): ParsedPrivatePresentation {
  let raw: unknown
  try { raw = JSON.parse(payload) } catch {
    throw new UnsupportedPresentationError('The presentation is not valid JSON.')
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new UnsupportedPresentationError('The presentation must be a JSON object.')
  }
  const record = raw as Record<string, unknown>
  const expectedKeys = ['schema', 'chainId', 'dao', 'proposalId', 'credentialVersion', 'proofSystem', 'statement', 'proof']
  if (Object.keys(record).length !== expectedKeys.length || !expectedKeys.every((key) => key in record)) {
    throw new UnsupportedPresentationError('The presentation has unexpected keys.')
  }
  if (record.schema !== ATTENDANCE_PRESENTATION_SCHEMA) {
    throw new UnsupportedPresentationError('The attendance presentation schema is not supported.')
  }
  if (record.credentialVersion !== ATTENDANCE_V2_VERSION) {
    throw new UnsupportedPresentationError('The attendance credential version is not supported.')
  }
  if (typeof record.proofSystem !== 'string' || !(TRUSTED_PROOF_SYSTEMS as readonly string[]).includes(record.proofSystem)) {
    throw new UnsupportedPresentationError('The presentation uses an untrusted proof system.')
  }
  if (typeof record.proof !== 'string') {
    throw new UnsupportedPresentationError('The presentation proof payload is missing.')
  }
  const statementRaw = record.statement
  if (typeof statementRaw !== 'object' || statementRaw === null || Array.isArray(statementRaw)) {
    throw new UnsupportedPresentationError('The presentation statement is missing.')
  }
  const statement = statementRaw as Record<string, unknown>
  if (Object.keys(statement).length !== 3 || !('context' in statement) || !('count' in statement) || !('root' in statement)) {
    throw new UnsupportedPresentationError('The presentation statement has unexpected keys.')
  }
  if (typeof statement.count !== 'number' || !Number.isInteger(statement.count) || statement.count < 0 || statement.count > 1024) {
    throw new UnsupportedPresentationError('The presentation count is outside the supported range.')
  }
  let chainId: number
  try {
    chainId = Number(parseCanonicalUint256(record.chainId))
  } catch {
    throw new UnsupportedPresentationError('The presentation chain ID is not canonical.')
  }
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new UnsupportedPresentationError('The presentation chain ID is outside the supported range.')
  }
  try {
    return {
      event: {
        chainId,
        daoAddress: parseDao(record.dao),
        proposalId: parseCanonicalUint256(record.proposalId),
      },
      credentialVersion: ATTENDANCE_V2_VERSION,
      proofSystem: record.proofSystem as TrustedProofSystemId,
      statement: {
        context: encodeField(parseField(statement.context)),
        count: statement.count,
        root: encodeField(parseField(statement.root)),
      },
      proof: decodeBase64(record.proof),
    }
  } catch (error) {
    if (error instanceof UnsupportedPresentationError) throw error
    throw new UnsupportedPresentationError(
      error instanceof InvalidAttendanceV2EncodingError ? error.message : 'The presentation is malformed.'
    )
  }
}

export interface FinalizedAttendanceRecord {
  version: number
  count: number
  root: Hex
  dataReference: string
}

/** Compares a file statement with the authenticated chain record. */
export function presentationMatchesRecord(
  parsed: ParsedPrivatePresentation,
  context: Hex,
  record: FinalizedAttendanceRecord,
): boolean {
  return (
    parsed.credentialVersion === record.version &&
    parsed.statement.context === context &&
    parsed.statement.count === record.count &&
    parsed.statement.root === record.root
  )
}

/** Suggested download name; contains no credential or wallet identifier. */
export function privatePresentationFileName(event: AttendanceV2Event): string {
  return `attendance-presentation-${event.chainId}-${event.proposalId.toString()}.json`
}

export { ATTENDANCE_V2_VERSION }
