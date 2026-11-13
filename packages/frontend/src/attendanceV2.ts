import { getAddress, verifyMessage, type Address, type Hex } from 'viem'
import { Noir, type CompiledCircuit } from '@noir-lang/noir_js'
import circuit from './attendanceHash.json' with { type: 'json' }
import type { AttendanceEvent } from './attendance.js'

export const ATTENDANCE_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n

// This executes the compiled, pinned upstream Noir T4 primitive. No handwritten
// permutation, alternate Poseidon parameters, prover, or remote witness service.
let runtime: Noir | undefined
async function hash(d: bigint, a: bigint, b: bigint): Promise<bigint> {
  runtime ??= new Noir(circuit as unknown as CompiledCircuit)
  const { returnValue } = await runtime.execute({ d: d.toString(), a: a.toString(), b: b.toString() })
  return BigInt(returnValue as string)
}

export function attendanceField(value: string): bigint {
  if (!/^0x[0-9a-f]{64}$/.test(value) || BigInt(value) >= ATTENDANCE_FIELD) throw new Error('Noncanonical attendance field.')
  return BigInt(value)
}

const fieldHex = (n: bigint): Hex => `0x${n.toString(16).padStart(64, '0')}`
function limbs(n: bigint): bigint[] {
  if (n < 0n || n >= 1n << 256n) throw new Error('Invalid uint256 event identifier.')
  return [n >> 128n, n & ((1n << 128n) - 1n)]
}

function contextWords(event: AttendanceEvent): bigint[] {
  if (!Number.isSafeInteger(event.chainId) || event.chainId < 0) throw new Error('Invalid chain ID.')
  return [...limbs(BigInt(event.chainId)), BigInt(getAddress(event.daoAddress)), ...limbs(event.proposalId)]
}

async function context(event: AttendanceEvent): Promise<bigint> {
  let state = 2n
  for (const word of contextWords(event)) state = await hash(5n, state, word)
  return state
}

export function attendanceV2SigningMessage(event: AttendanceEvent): string {
  contextWords(event)
  return `DAO for Clubs attendance v2\nChain ID: ${event.chainId}\nDAO: ${getAddress(event.daoAddress)}\nProposal ID: ${event.proposalId}`
}

export function encodeAttendanceV2Qr(event: AttendanceEvent, entry: Hex): string {
  attendanceField(entry)
  contextWords(event)
  return JSON.stringify({ schema: 'attendance-qr/v2', chainId: String(event.chainId), dao: event.daoAddress.toLowerCase(), proposalId: String(event.proposalId), entry })
}

export function parseAttendanceV2Qr(payload: string, event: AttendanceEvent): Hex {
  const value = JSON.parse(payload) as Record<string, unknown>
  if (!value || typeof value.entry !== 'string') throw new Error('Invalid v2 QR.')
  attendanceField(value.entry)
  if (payload !== encodeAttendanceV2Qr(event, value.entry as Hex)) throw new Error('Noncanonical or wrong-event v2 QR. Regenerate v1 credentials.')
  return value.entry as Hex
}

/** Recovery verifies the exact message and selected EOA; only entry leaves here. */
export async function deriveAttendanceV2Credential(event: AttendanceEvent, account: Address, signature: Hex): Promise<Hex> {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error('A 65-byte EOA signature is required.')
  const r = BigInt(`0x${signature.slice(2, 66)}`)
  const s = BigInt(`0x${signature.slice(66, 130)}`)
  let v = BigInt(`0x${signature.slice(130)}`)
  if (v === 0n || v === 1n) v += 27n
  if (r === 0n || r >= ORDER || s === 0n || s > ORDER / 2n || (v !== 27n && v !== 28n)) throw new Error('Noncanonical ECDSA signature.')
  const normalized = `${signature.slice(0, 130)}${v.toString(16)}` as Hex
  if (!await verifyMessage({ address: account, message: attendanceV2SigningMessage(event), signature: normalized })) throw new Error('Signature does not match the selected wallet.')
  const ctx = await context(event)
  let secret = ctx
  for (const word of [...limbs(r), ...limbs(s), v]) secret = await hash(1n, secret, word)
  return fieldHex(await hash(2n, ctx, secret))
}

export const ATTENDANCE_FINALIZATION_WARNING = 'Finalization is immutable. Later attendees, additions and corrections cannot be included. Published hashed attendance data is public and may be retained indefinitely. Attendance does not imply funding or voting approval.'

export interface PreparedAttendanceSet {
  readonly schema: 'attendance-set/v2'
  readonly chainId: string
  readonly dao: string
  readonly proposalId: string
  readonly entries: readonly Hex[]
  readonly bytes: string
  readonly root: Hex
  readonly count: number
  readonly warning: string
}

function datasetBytes(event: AttendanceEvent, entries: readonly Hex[]): string {
  return JSON.stringify({ schema: 'attendance-set/v2', chainId: String(event.chainId), dao: event.daoAddress.toLowerCase(), proposalId: String(event.proposalId), entries })
}

/** Snapshot values before the first await; no caller-owned arrays survive. */
export async function prepareAttendanceV2Set(event: AttendanceEvent, values: readonly Hex[]): Promise<PreparedAttendanceSet> {
  const identity = { ...event }
  const entries = [...new Set(values.map(value => { attendanceField(value); return value }))].sort()
  if (entries.length > 1024) throw new Error('Attendance supports at most 1,024 unique entries.')
  const ctx = await context(identity)
  // Local memoization skips repeated padding subtrees, without retaining secrets
  // or a global cache across attendees/events.
  const cache = new Map<string, bigint>()
  let executions = 0
  async function h(d: bigint, a: bigint, b: bigint) {
    const key = `${d}:${a}:${b}`
    let result = cache.get(key)
    if (result === undefined) {
      result = await hash(d, a, b)
      cache.set(key, result)
      // Allow camera detections/account changes to invalidate the snapshot;
      // a microtask-only hash loop would monopolize the browser main thread.
      if (++executions % 16 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0))
    }
    return result
  }
  const empty = await h(4n, ctx, 0n)
  let row: bigint[] = []
  for (const entry of entries) row.push(await h(3n, ctx, attendanceField(entry)))
  row.push(...Array<bigint>(1024 - entries.length).fill(empty))
  for (let level = 0; level < 10; level++) {
    const next: bigint[] = []
    for (let i = 0; i < row.length; i += 2) next.push(await h(16n + BigInt(level), row[i], row[i + 1]))
    row = next
  }
  const root = fieldHex(await h(6n, ctx, await h(7n, BigInt(entries.length), row[0])))
  return Object.freeze({ schema: 'attendance-set/v2', chainId: String(identity.chainId), dao: identity.daoAddress.toLowerCase(), proposalId: String(identity.proposalId), entries: Object.freeze(entries), bytes: datasetBytes(identity, entries), root, count: entries.length, warning: ATTENDANCE_FINALIZATION_WARNING })
}

/** Canonical readers reject rather than repair reordered/duplicate/extra data. */
export async function validateAttendanceV2Set(bytes: string, event: AttendanceEvent): Promise<PreparedAttendanceSet> {
  const value = JSON.parse(bytes) as { entries?: unknown }
  if (!value || !Array.isArray(value.entries) || !value.entries.every(entry => typeof entry === 'string')) throw new Error('Invalid attendance dataset.')
  const result = await prepareAttendanceV2Set(event, value.entries as Hex[])
  if (result.bytes !== bytes) throw new Error('Noncanonical or mismatched attendance dataset.')
  return result
}
