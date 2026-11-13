import { isAddress, type Address, type Hex } from 'viem'
import type { AttendanceStorageState, AttendanceStore } from './attendanceStorage.js'
import { ATTENDANCE_QR_VERSION, sameAttendanceEvent, type AttendanceEvent } from './attendance.js'
import { parseAttendanceV2Qr } from './attendanceV2.js'

/**
 * Organizer-side attendance collection (spec 06.02). Validation and
 * deduplication live here; only the camera transport is replaceable.
 */

export type ScanRejectionReason = 'malformed' | 'unexpected-fields' | 'wrong-event'

export type ScanResult =
  /** `saved` is true only when the entry reached browser storage. */
  | { status: 'accepted'; count: number; saved: boolean }
  | { status: 'duplicate'; count: number }
  | { status: 'rejected'; reason: ScanRejectionReason; message: string; count: number }

/** What the collection retains: hashed entries and event context, nothing else. */
export interface AttendanceCollectionView {
  event: AttendanceEvent
  count: number
  entries: Hex[]
  /** Whether the counted entries are durably saved in this browser. */
  storage: AttendanceStorageState
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

export function createAttendanceCollection(event: AttendanceEvent, store: AttendanceStore): AttendanceCollection {
  const loaded = store.load()
  const entries: Hex[] = [...loaded.entries]
  const seen = new Set<Hex>(entries)
  let storageState = loaded.state
  const reject = (reason: ScanRejectionReason): ScanResult => ({
    status: 'rejected',
    reason,
    message: REJECTION_MESSAGES[reason],
    count: entries.length,
  })

  return {
    submit(payload) {
      if (event.credentialVersion === 2) {
        let entry: Hex
        try { entry = parseAttendanceV2Qr(payload, event) } catch { return reject('malformed') }
        if (seen.has(entry)) return { status: 'duplicate', count: entries.length }
        seen.add(entry)
        entries.push(entry)
        storageState = store.save(entries)
        return { status: 'accepted', count: entries.length, saved: storageState.status === 'saved' }
      }
      const parsed = parseAttendanceQr(payload)
      if (!parsed.ok) return reject(parsed.reason)
      if (!sameAttendanceEvent({ chainId: parsed.chainId, daoAddress: parsed.dao, proposalId: parsed.proposalId }, event)) {
        return reject('wrong-event')
      }
      if (seen.has(parsed.entry)) return { status: 'duplicate', count: entries.length }
      seen.add(parsed.entry)
      entries.push(parsed.entry)
      storageState = store.save(entries)
      return { status: 'accepted', count: entries.length, saved: storageState.status === 'saved' }
    },
    read: () => ({ event: { ...event }, count: entries.length, entries: [...entries], storage: storageState }),
  }
}

export type ScanListener = (result: ScanResult) => void

/** An active organizer scan: the camera feeds the validated, deduplicated collection. */
export interface AttendanceScanSession {
  read(): AttendanceCollectionView
  onScan(listener: ScanListener): () => void
  /** Called once when the session ends, whether by stop() or by losing organizer rights. */
  onStop(listener: () => void): () => void
  /** Stops the camera. Accepted entries stay in the collection. */
  stop(): void
}

/** The camera re-detects a held code every frame; identical payloads inside this window are one scan. */
export const REPEAT_DETECTION_WINDOW_MS = 2000

export interface ScanSessionOptions {
  collection: AttendanceCollection
  camera: CameraScanner
  /** Re-checked on every detection; when false the session stops itself. */
  isOrganizer(): boolean
  now?: () => number
}

/** Wires camera detections into the collection. Throws CameraError if the camera cannot start. */
export async function createScanSession(options: ScanSessionOptions): Promise<AttendanceScanSession> {
  const { collection, camera, isOrganizer, now = Date.now } = options
  const scanListeners = new Set<ScanListener>()
  const stopListeners = new Set<() => void>()
  let scanning = true
  let handle: { stop(): void } | undefined
  let last: { payload: string; at: number } | null = null

  function stop() {
    if (!scanning) return
    scanning = false
    handle?.stop()
    stopListeners.forEach(listener => listener())
  }

  handle = await camera.start(payload => {
    if (!scanning) return
    if (!isOrganizer()) { stop(); return }
    const at = now()
    const repeat = last !== null && last.payload === payload && at - last.at < REPEAT_DETECTION_WINDOW_MS
    last = { payload, at }
    if (repeat) return // same code still in frame: keep the earlier feedback
    const result = collection.submit(payload)
    scanListeners.forEach(listener => listener(result))
  })
  if (!scanning) handle.stop() // stopped while the camera was starting

  return {
    read: () => collection.read(),
    onScan(listener) {
      scanListeners.add(listener)
      return () => scanListeners.delete(listener)
    },
    onStop(listener) {
      stopListeners.add(listener)
      return () => stopListeners.delete(listener)
    },
    stop,
  }
}
