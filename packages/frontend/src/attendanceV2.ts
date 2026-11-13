import { getAddress, type Address, type Hex } from 'viem'
import { BN254_PRIME, poseidon2Hash } from './poseidon2.js'

/**
 * Approved attendance v2 canonical format.
 *
 * See docs/attendance-format-v2-proposal.md. This module is the single browser
 * seam for v2 credential recovery, the fixed-depth attendance tree, membership
 * paths and the canonical dataset/QR encodings. It contains no ZK prover; it
 * only produces the deterministic values that both private proofs and public
 * claims depend on.
 *
 * v1 credentials and QR codes remain frozen in `attendance.ts` and are never
 * reinterpreted as v2.
 */

export const ATTENDANCE_V2_VERSION = 2
export const ATTENDANCE_SET_SCHEMA = 'attendance-set/v2'
export const ATTENDANCE_QR_SCHEMA = 'attendance-qr/v2'
export const ATTENDANCE_PATH_SCHEMA = 'attendance-path/v2'
export const ATTENDANCE_V2_MESSAGE_LABEL = 'DAO for Clubs attendance v2'
export const ATTENDANCE_TREE_DEPTH = 10
export const MAX_ATTENDANCE_ENTRIES = 1 << ATTENDANCE_TREE_DEPTH

const DOMAIN = {
  recovery: 1n,
  entry: 2n,
  leaf: 3n,
  empty: 4n,
  context: 5n,
  root: 6n,
  count: 7n,
  node: 16n,
} as const

const SECP256K1_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const UINT256_MAX = (1n << 256n) - 1n
const UINT160_MAX = (1n << 160n) - 1n

export interface AttendanceV2Event {
  chainId: number
  daoAddress: Address
  proposalId: bigint
}

export interface AttendanceV2Dataset {
  event: AttendanceV2Event
  /** Strictly ascending, unique canonical field strings. */
  entries: readonly Hex[]
  count: number
  /** Canonical feed-forward root bound to version, context and count. */
  root: Hex
  /** Leaf-up membership path for an index inside the authenticated count. */
  path: (index: number) => AttendanceV2Path
}

export interface AttendanceV2Path {
  index: number
  siblings: readonly Hex[]
}

export interface AttendanceV2Witness extends AttendanceV2Path {
  /** Canonical field secret. Never exported, logged or sent anywhere. */
  readonly secret: bigint
  readonly entry: Hex
  readonly context: Hex
  readonly count: number
  readonly root: Hex
}

// ---------------------------------------------------------------------------
// Canonical scalar encodings
// ---------------------------------------------------------------------------

export class InvalidAttendanceV2EncodingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidAttendanceV2EncodingError'
  }
}

/** Parses exactly `0x` + 64 lowercase hex digits representing a field < prime. */
export function parseField(value: unknown): bigint {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new InvalidAttendanceV2EncodingError('A canonical field is 0x followed by 64 lowercase hex digits.')
  }
  const parsed = BigInt(value)
  if (parsed >= BN254_PRIME) {
    throw new InvalidAttendanceV2EncodingError('The field value is not below the BN254 scalar field prime.')
  }
  return parsed
}

/** Encodes a canonical field string; rejects unreduced or negative integers. */
export function encodeField(value: bigint): Hex {
  if (value < 0n || value >= BN254_PRIME) {
    throw new InvalidAttendanceV2EncodingError('The field value is not below the BN254 scalar field prime.')
  }
  return `0x${value.toString(16).padStart(64, '0')}`
}

/** Parses a canonical unsigned uint256 used by chain/proposal identifiers. */
export function parseCanonicalUint256(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new InvalidAttendanceV2EncodingError('Identifiers are shortest base-10 unsigned integer strings.')
  }
  const parsed = BigInt(value)
  if (parsed > UINT256_MAX) {
    throw new InvalidAttendanceV2EncodingError('The identifier does not fit uint256.')
  }
  return parsed
}

export function encodeCanonicalUint256(value: bigint): string {
  if (value < 0n || value > UINT256_MAX) {
    throw new InvalidAttendanceV2EncodingError('The identifier does not fit uint256.')
  }
  return value.toString(10)
}

function normalizeDao(value: string): Address {
  let checksummed: Address
  try {
    checksummed = getAddress(value)
  } catch {
    throw new InvalidAttendanceV2EncodingError('The DAO address is not a valid 20-byte EVM address.')
  }
  return checksummed
}

/** Canonical dataset/QR spelling: `0x` + 40 lowercase hex digits. */
export function encodeDao(value: string): string {
  return normalizeDao(value).toLowerCase()
}

export function parseDao(value: unknown): Address {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{40}$/.test(value)) {
    throw new InvalidAttendanceV2EncodingError('The DAO address must be 0x followed by 40 lowercase hex digits.')
  }
  const address = value as Address
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    throw new InvalidAttendanceV2EncodingError('The DAO address must be 0x followed by 40 lowercase hex digits.')
  }
  return address
}

/** Splits a uint256 into independently canonical 128-bit limbs, high first. */
export function uint256Limbs(value: bigint): [bigint, bigint] {
  if (value < 0n || value > UINT256_MAX) {
    throw new InvalidAttendanceV2EncodingError('The value does not fit uint256.')
  }
  return [value >> 128n, value & ((1n << 128n) - 1n)]
}

export function attendanceV2Event(event: AttendanceV2Event): AttendanceV2Event {
  if (!Number.isSafeInteger(event.chainId) || event.chainId <= 0) {
    throw new InvalidAttendanceV2EncodingError('The chain ID must be a positive safe integer.')
  }
  if (event.proposalId < 0n || event.proposalId > UINT256_MAX) {
    throw new InvalidAttendanceV2EncodingError('The proposal ID does not fit uint256.')
  }
  return { chainId: event.chainId, daoAddress: normalizeDao(event.daoAddress), proposalId: event.proposalId }
}

function daoField(event: AttendanceV2Event): bigint {
  return BigInt(encodeDao(event.daoAddress))
}

// ---------------------------------------------------------------------------
// Context, recovery and entry
// ---------------------------------------------------------------------------

/** Folds chain, DAO, proposal and credential version into the event context. */
export function attendanceV2Context(rawEvent: AttendanceV2Event): bigint {
  const event = attendanceV2Event(rawEvent)
  let state = BigInt(ATTENDANCE_V2_VERSION)
  const words = [
    ...uint256Limbs(BigInt(event.chainId)),
    daoField(event),
    ...uint256Limbs(event.proposalId),
  ]
  for (const word of words) state = poseidon2Hash(DOMAIN.context, state, word)
  return state
}

export function attendanceV2SigningMessage(rawEvent: AttendanceV2Event): string {
  const event = attendanceV2Event(rawEvent)
  return [
    ATTENDANCE_V2_MESSAGE_LABEL,
    `Chain ID: ${encodeCanonicalUint256(BigInt(event.chainId))}`,
    `DAO: ${getAddress(event.daoAddress)}`,
    `Proposal ID: ${encodeCanonicalUint256(event.proposalId)}`,
  ].join('\n')
}

export class InvalidAttendanceV2SignatureError extends Error {
  constructor(message = 'The wallet signature is not a canonical 65-byte low-s ECDSA signature.') {
    super(message)
    this.name = 'InvalidAttendanceV2SignatureError'
  }
}

/**
 * Recovers the v2 secret from the wallet signature. Only deterministic EOA
 * signatures are accepted: exactly r||s||v, low-s, v in {27, 28}.
 */
export function recoverAttendanceV2Secret(context: bigint, signature: Hex): bigint {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new InvalidAttendanceV2SignatureError()
  const r = BigInt(`0x${signature.slice(2, 66)}`)
  const s = BigInt(`0x${signature.slice(66, 130)}`)
  const v = BigInt(`0x${signature.slice(130)}`)
  if (r === 0n || r >= SECP256K1_ORDER) throw new InvalidAttendanceV2SignatureError()
  if (s === 0n || s > SECP256K1_ORDER / 2n) throw new InvalidAttendanceV2SignatureError('High-s signatures are rejected; do not derive a different secret.')
  if (v !== 27n && v !== 28n) throw new InvalidAttendanceV2SignatureError()
  let state = context
  for (const word of [...uint256Limbs(r), ...uint256Limbs(s), v]) {
    state = poseidon2Hash(DOMAIN.recovery, state, word)
  }
  return state
}

export function deriveAttendanceV2Entry(context: bigint, secret: bigint): Hex {
  return encodeField(poseidon2Hash(DOMAIN.entry, context, secret))
}

/** Derives the complete local credential without exporting the secret. */
export function deriveAttendanceV2Credential(
  rawEvent: AttendanceV2Event,
  signature: Hex,
): { event: AttendanceV2Event; context: Hex; secret: bigint; entry: Hex } {
  const event = attendanceV2Event(rawEvent)
  const context = attendanceV2Context(event)
  const secret = recoverAttendanceV2Secret(context, signature)
  return { event, context: encodeField(context), secret, entry: deriveAttendanceV2Entry(context, secret) }
}

// ---------------------------------------------------------------------------
// Fixed-depth tree
// ---------------------------------------------------------------------------

function leafHash(context: bigint, entry: bigint): bigint {
  return poseidon2Hash(DOMAIN.leaf, context, entry)
}

function emptyLeaf(context: bigint): bigint {
  return poseidon2Hash(DOMAIN.empty, context, 0n)
}

function parentHash(level: number, left: bigint, right: bigint): bigint {
  return poseidon2Hash(DOMAIN.node + BigInt(level), left, right)
}

function finalRoot(context: bigint, count: number, treeRoot: bigint): bigint {
  return poseidon2Hash(DOMAIN.root, context, poseidon2Hash(DOMAIN.count, BigInt(count), treeRoot))
}

function sortUniqueEntries(entries: readonly string[]): bigint[] {
  const unique = new Map<string, bigint>()
  for (const value of entries) {
    const parsed = parseField(value)
    unique.set(encodeField(parsed), parsed)
  }
  if (unique.size > MAX_ATTENDANCE_ENTRIES) {
    throw new InvalidAttendanceV2EncodingError(`At most ${MAX_ATTENDANCE_ENTRIES} unique entries are supported.`)
  }
  return [...unique.values()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** Builds the approved root and all membership paths for a set of entries. */
export function buildAttendanceV2Tree(rawEvent: AttendanceV2Event, entries: readonly string[]): {
  context: Hex
  entries: Hex[]
  count: number
  root: Hex
  path: (index: number) => AttendanceV2Path
} {
  const event = attendanceV2Event(rawEvent)
  const context = attendanceV2Context(event)
  const sorted = sortUniqueEntries(entries)
  const leaf = emptyLeaf(context)
  const levelZero: bigint[] = new Array(MAX_ATTENDANCE_ENTRIES).fill(leaf)
  sorted.forEach((entry, index) => { levelZero[index] = leafHash(context, entry) })
  const levels: bigint[][] = [levelZero]
  for (let level = 0; level < ATTENDANCE_TREE_DEPTH; level++) {
    const row = levels[level]!
    const next: bigint[] = []
    for (let index = 0; index < row.length; index += 2) {
      next.push(parentHash(level, row[index]!, row[index + 1]!))
    }
    levels.push(next)
  }
  const count = sorted.length
  const root = encodeField(finalRoot(context, count, levels[ATTENDANCE_TREE_DEPTH]![0]!))
  const path = (index: number): AttendanceV2Path => {
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new InvalidAttendanceV2EncodingError('The attendance index is outside the authenticated count.')
    }
    return {
      index,
      siblings: levels
        .slice(0, ATTENDANCE_TREE_DEPTH)
        .map((row, level) => encodeField(row[(index >> level) ^ 1]!)),
    }
  }
  return {
    context: encodeField(context),
    entries: sorted.map((entry) => encodeField(entry)),
    count,
    root,
    path,
  }
}

/** Recomputes the root from a secret, count and leaf-up path. */
export function attendanceV2Membership(
  context: bigint,
  secret: bigint,
  count: number,
  path: AttendanceV2Path,
): Hex {
  if (!Number.isInteger(count) || count < 1 || count > MAX_ATTENDANCE_ENTRIES) {
    throw new InvalidAttendanceV2EncodingError('The authenticated count is outside the supported range.')
  }
  if (!Number.isInteger(path.index) || path.index < 0 || path.index >= count) {
    throw new InvalidAttendanceV2EncodingError('The attendance index is outside the authenticated count.')
  }
  if (path.siblings.length !== ATTENDANCE_TREE_DEPTH) {
    throw new InvalidAttendanceV2EncodingError(`A path has exactly ${ATTENDANCE_TREE_DEPTH} siblings.`)
  }
  const entry = poseidon2Hash(DOMAIN.entry, context, secret)
  let node = leafHash(context, entry)
  for (let level = 0; level < ATTENDANCE_TREE_DEPTH; level++) {
    const sibling = parseField(path.siblings[level])
    node = (path.index >> level) & 1
      ? parentHash(level, sibling, node)
      : parentHash(level, node, sibling)
  }
  return encodeField(finalRoot(context, count, node))
}

/** Validates a path against a witness secret and the authenticated event root. */
export function attendanceV2MembershipHolds(
  context: bigint,
  secret: bigint,
  count: number,
  root: Hex,
  path: AttendanceV2Path,
): boolean {
  return attendanceV2Membership(context, secret, count, path) === root
}

/**
 * Locates the credential in a published dataset and returns the local witness.
 * Rejects duplicates, reordering and context mismatches rather than repairing
 * a dataset that does not match the authenticated chain record.
 */
export function prepareAttendanceV2Witness(
  dataset: AttendanceV2Dataset,
  secret: bigint,
  event: AttendanceV2Event,
): AttendanceV2Witness | null {
  const expectedContext = attendanceV2Context(event)
  const datasetContext = attendanceV2Context(dataset.event)
  if (datasetContext !== expectedContext) {
    throw new InvalidAttendanceV2EncodingError('The published dataset belongs to a different event.')
  }
  if (dataset.entries.length !== dataset.count || dataset.count > MAX_ATTENDANCE_ENTRIES) {
    throw new InvalidAttendanceV2EncodingError('The published dataset count is inconsistent.')
  }
  let previous: bigint | null = null
  for (const entry of dataset.entries) {
    const parsed = parseField(entry)
    if (previous !== null && parsed <= previous) {
      throw new InvalidAttendanceV2EncodingError('Published entries must be strictly ascending and unique.')
    }
    previous = parsed
  }
  const context = expectedContext
  const entry = deriveAttendanceV2Entry(context, secret)
  const index = dataset.entries.indexOf(entry)
  if (index < 0) return null
  const path = dataset.path(index)
  if (!attendanceV2MembershipHolds(context, secret, dataset.count, dataset.root, path)) {
    throw new InvalidAttendanceV2EncodingError('The published path does not reproduce the authenticated root.')
  }
  return {
    secret,
    entry,
    context: encodeField(context),
    count: dataset.count,
    root: dataset.root,
    index,
    siblings: path.siblings,
  }
}

// ---------------------------------------------------------------------------
// Canonical QR and dataset JSON
// ---------------------------------------------------------------------------

export function encodeAttendanceV2Qr(event: AttendanceV2Event & { entry: Hex }): string {
  const normalized = attendanceV2Event(event)
  return JSON.stringify({
    schema: ATTENDANCE_QR_SCHEMA,
    chainId: encodeCanonicalUint256(BigInt(normalized.chainId)),
    dao: encodeDao(normalized.daoAddress),
    proposalId: encodeCanonicalUint256(normalized.proposalId),
    entry: encodeField(parseField(event.entry)),
  })
}

export function decodeAttendanceV2Qr(payload: string): AttendanceV2Event & { entry: Hex } {
  let raw: unknown
  try { raw = JSON.parse(payload) } catch { throw new InvalidAttendanceV2EncodingError('The attendance QR is not valid JSON.') }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new InvalidAttendanceV2EncodingError('The attendance QR must be a JSON object.')
  }
  const record = raw as Record<string, unknown>
  const expectedKeys = ['schema', 'chainId', 'dao', 'proposalId', 'entry']
  if (Object.keys(record).length !== expectedKeys.length || !expectedKeys.every((key) => key in record)) {
    throw new InvalidAttendanceV2EncodingError('The attendance QR has unexpected keys.')
  }
  if (record.schema !== ATTENDANCE_QR_SCHEMA) {
    throw new InvalidAttendanceV2EncodingError('The attendance QR schema is not supported.')
  }
  const result = {
    chainId: Number(parseCanonicalUint256(record.chainId)),
    daoAddress: parseDao(record.dao),
    proposalId: parseCanonicalUint256(record.proposalId),
    entry: encodeField(parseField(record.entry)),
  }
  if (!Number.isSafeInteger(result.chainId) || result.chainId <= 0) {
    throw new InvalidAttendanceV2EncodingError('The chain ID is outside the supported range.')
  }
  return result
}

export interface AttendanceV2PathDocument extends AttendanceV2Path {
  schema: typeof ATTENDANCE_PATH_SCHEMA
}

export function encodeAttendanceV2Path(path: AttendanceV2Path): string {
  if (!Number.isInteger(path.index) || path.index < 0) {
    throw new InvalidAttendanceV2EncodingError('The attendance index must be a non-negative integer.')
  }
  if (path.siblings.length !== ATTENDANCE_TREE_DEPTH) {
    throw new InvalidAttendanceV2EncodingError(`A path has exactly ${ATTENDANCE_TREE_DEPTH} siblings.`)
  }
  return JSON.stringify({
    schema: ATTENDANCE_PATH_SCHEMA,
    index: path.index,
    siblings: path.siblings.map((sibling) => encodeField(parseField(sibling))),
  })
}

export function decodeAttendanceV2Path(payload: string): AttendanceV2Path {
  let raw: unknown
  try { raw = JSON.parse(payload) } catch { throw new InvalidAttendanceV2EncodingError('The path is not valid JSON.') }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new InvalidAttendanceV2EncodingError('The path must be a JSON object.')
  }
  const record = raw as Record<string, unknown>
  if (record.schema !== ATTENDANCE_PATH_SCHEMA) {
    throw new InvalidAttendanceV2EncodingError('The attendance path schema is not supported.')
  }
  if (Object.keys(record).length !== 3 || !('index' in record) || !('siblings' in record)) {
    throw new InvalidAttendanceV2EncodingError('The attendance path has unexpected keys.')
  }
  if (typeof record.index !== 'number' || !Number.isInteger(record.index) || record.index < 0 || record.index >= MAX_ATTENDANCE_ENTRIES) {
    throw new InvalidAttendanceV2EncodingError('The attendance path index is outside the supported range.')
  }
  if (!Array.isArray(record.siblings) || record.siblings.length !== ATTENDANCE_TREE_DEPTH) {
    throw new InvalidAttendanceV2EncodingError(`A path has exactly ${ATTENDANCE_TREE_DEPTH} siblings.`)
  }
  return { index: record.index, siblings: record.siblings.map((sibling) => encodeField(parseField(sibling))) }
}

export interface AttendanceV2DatasetDocument {
  schema: typeof ATTENDANCE_SET_SCHEMA
  chainId: string
  dao: string
  proposalId: string
  entries: Hex[]
}

function datasetDocument(event: AttendanceV2Event, entries: readonly Hex[]): AttendanceV2DatasetDocument {
  const normalized = attendanceV2Event(event)
  return {
    schema: ATTENDANCE_SET_SCHEMA,
    chainId: encodeCanonicalUint256(BigInt(normalized.chainId)),
    dao: encodeDao(normalized.daoAddress),
    proposalId: encodeCanonicalUint256(normalized.proposalId),
    entries: entries.map((entry) => encodeField(parseField(entry))),
  }
}

/** Encodes the exact canonical publication bytes (compact JSON, fixed key order). */
export function encodeAttendanceV2Dataset(event: AttendanceV2Event, entries: readonly string[]): string {
  const sorted = sortUniqueEntries(entries).map((entry) => encodeField(entry))
  return JSON.stringify(datasetDocument(event, sorted))
}

/**
 * Parses and validates canonical publication bytes. Noncanonical encodings,
 * duplicate JSON keys, unsupported schemas, unsorted/duplicate entries and
 * excessive counts are rejected rather than repaired.
 */
export function decodeAttendanceV2Dataset(payload: string): AttendanceV2Dataset {
  let raw: unknown
  try { raw = JSON.parse(payload) } catch { throw new InvalidAttendanceV2EncodingError('The attendance set is not valid JSON.') }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new InvalidAttendanceV2EncodingError('The attendance set must be a JSON object.')
  }
  const record = raw as Record<string, unknown>
  const expectedKeys = ['schema', 'chainId', 'dao', 'proposalId', 'entries']
  if (Object.keys(record).length !== expectedKeys.length || !expectedKeys.every((key) => key in record)) {
    throw new InvalidAttendanceV2EncodingError('The attendance set has unexpected keys.')
  }
  if (record.schema !== ATTENDANCE_SET_SCHEMA) {
    throw new InvalidAttendanceV2EncodingError('The attendance set schema is not supported.')
  }
  const chainId = Number(parseCanonicalUint256(record.chainId))
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new InvalidAttendanceV2EncodingError('The chain ID is outside the supported range.')
  }
  const event: AttendanceV2Event = {
    chainId,
    daoAddress: parseDao(record.dao),
    proposalId: parseCanonicalUint256(record.proposalId),
  }
  if (!Array.isArray(record.entries)) {
    throw new InvalidAttendanceV2EncodingError('The attendance set entries must be an array.')
  }
  const entries = record.entries.map((entry) => encodeField(parseField(entry)))
  if (entries.length > MAX_ATTENDANCE_ENTRIES) {
    throw new InvalidAttendanceV2EncodingError(`At most ${MAX_ATTENDANCE_ENTRIES} unique entries are supported.`)
  }
  const canonical = JSON.stringify(datasetDocument(event, entries))
  if (canonical !== payload) {
    throw new InvalidAttendanceV2EncodingError('The attendance set is not in canonical form.')
  }
  const tree = buildAttendanceV2Tree(event, entries)
  return {
    event,
    entries: tree.entries,
    count: tree.count,
    root: tree.root,
    path: tree.path,
  }
}

/** Whether two events identify the same deployment-wide attendance commitment. */
export function sameAttendanceV2Event(a: AttendanceV2Event, b: AttendanceV2Event): boolean {
  return (
    a.chainId === b.chainId &&
    a.daoAddress.toLowerCase() === b.daoAddress.toLowerCase() &&
    a.proposalId === b.proposalId
  )
}
