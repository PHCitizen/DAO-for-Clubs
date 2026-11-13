import { isAddress, type Address, type Hex } from 'viem'
import { ATTENDANCE_QR_VERSION, type AttendanceEvent } from './attendance.js'

/**
 * Organizer-side attendance collection (spec 06.02). Validation and
 * deduplication live here; only the camera transport is replaceable.
 */

export type ScanRejectionReason = 'malformed' | 'unexpected-fields' | 'wrong-event'

export type ScanResult =
  | { status: 'accepted'; count: number }
  | { status: 'duplicate'; count: number }
  | { status: 'rejected'; reason: ScanRejectionReason; message: string; count: number }

/** What the collection retains: hashed entries and event context, nothing else. */
export interface AttendanceCollectionView {
  event: AttendanceEvent
  count: number
  entries: Hex[]
}

export type CameraFailureKind = 'permission-denied' | 'unavailable'

export class CameraError extends Error {
  constructor(readonly kind: CameraFailureKind) {
    super(
      kind === 'permission-denied'
        ? 'Camera permission was denied. Allow camera access and try again.'
        : 'No usable camera was found in this browser.'
    )
    this.name = 'CameraError'
  }
}

/** Camera transport: delivers decoded QR text. Replaced by a controlled fake in tests. */
export interface CameraScanner {
  start(onPayload: (payload: string) => void): Promise<{ stop(): void }>
}

const QR_FIELDS = ['v', 'chainId', 'dao', 'proposalId', 'entry'] as const
const ENTRY_PATTERN = /^0x[0-9a-fA-F]{64}$/

type ParsedQr =
  | { ok: true; chainId: number; dao: Address; proposalId: bigint; entry: Hex }
  | { ok: false; reason: 'malformed' | 'unexpected-fields' }

function parseAttendanceQr(payload: string): ParsedQr {
  let value: unknown
  try {
    value = JSON.parse(payload)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: 'malformed' }
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  // Any extra field could carry a secret, signature, or identity: refuse the whole payload.
  if (keys.some(key => !(QR_FIELDS as readonly string[]).includes(key))) {
    return { ok: false, reason: 'unexpected-fields' }
  }
  const { v, chainId, dao, proposalId, entry } = record
  if (
    v !== ATTENDANCE_QR_VERSION ||
    !Number.isSafeInteger(chainId) ||
    typeof dao !== 'string' ||
    !isAddress(dao, { strict: false }) ||
    typeof proposalId !== 'string' ||
    !/^\d+$/.test(proposalId) ||
    typeof entry !== 'string' ||
    !ENTRY_PATTERN.test(entry)
  ) {
    return { ok: false, reason: 'malformed' }
  }
  return {
    ok: true,
    chainId: chainId as number,
    dao: dao as Address,
    proposalId: BigInt(proposalId),
    entry: entry.toLowerCase() as Hex,
  }
}

const REJECTION_MESSAGES: Record<ScanRejectionReason, string> = {
  malformed: 'Not a valid attendance QR code. Nothing was added.',
  'unexpected-fields': 'This QR carries unexpected data and was rejected. Nothing was added.',
  'wrong-event': 'This QR is for a different event or deployment. Nothing was added.',
}

export interface AttendanceCollection {
  submit(payload: string): ScanResult
  read(): AttendanceCollectionView
}

export function createAttendanceCollection(event: AttendanceEvent): AttendanceCollection {
  const entries: Hex[] = []
  const seen = new Set<Hex>()
  const reject = (reason: ScanRejectionReason): ScanResult => ({
    status: 'rejected',
    reason,
    message: REJECTION_MESSAGES[reason],
    count: entries.length,
  })

  return {
    submit(payload) {
      const parsed = parseAttendanceQr(payload)
      if (!parsed.ok) return reject(parsed.reason)
      if (
        parsed.chainId !== event.chainId ||
        parsed.dao.toLowerCase() !== event.daoAddress.toLowerCase() ||
        parsed.proposalId !== event.proposalId
      ) {
        return reject('wrong-event')
      }
      if (seen.has(parsed.entry)) return { status: 'duplicate', count: entries.length }
      seen.add(parsed.entry)
      entries.push(parsed.entry)
      return { status: 'accepted', count: entries.length }
    },
    read: () => ({ event: { ...event }, count: entries.length, entries: [...entries] }),
  }
}
