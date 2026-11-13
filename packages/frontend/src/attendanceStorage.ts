import { isAddress, type Hex } from 'viem'
import { attendanceEventKey, type AttendanceEvent } from './attendance.js'

/**
 * Local persistence for the organizer's attendance collection (spec 06.03).
 * Only hashed entries plus the schema version and event identity are saved:
 * never names, attendee addresses, signatures, secrets, or pinning credentials.
 */

/** The subset of the Web Storage API used here; replaced by a controlled fake in tests. */
export interface AttendanceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type AttendanceStorageStatus = 'saved' | 'save-failed' | 'unavailable' | 'corrupt'

/** Honest persistence state: 'saved' means every counted entry is in storage. */
export interface AttendanceStorageState {
  status: AttendanceStorageStatus
  message: string
}

export const STORAGE_MESSAGES: Record<AttendanceStorageStatus, string> = {
  saved: 'Saved in this browser.',
  'save-failed': 'Could not save to this browser. Entries are counted for now but will be lost on reload.',
  unavailable: 'Browser storage is unavailable. Entries are counted for now but will be lost on reload.',
  corrupt: 'Saved attendance for this event was unreadable and was not restored. New entries start a fresh saved list.',
}

export interface AttendanceStore {
  /** Entries restored for the event and the state they were loaded in. */
  load(): { entries: Hex[]; state: AttendanceStorageState }
  /** Replaces the saved list; never throws. */
  save(entries: Hex[]): AttendanceStorageState
}

const SCHEMA = 1
const KEY_PREFIX = 'dao-for-clubs:attendance:v1:'
const ENTRY_PATTERN = /^0x[0-9a-f]{64}$/

const state = (status: AttendanceStorageStatus): AttendanceStorageState => ({ status, message: STORAGE_MESSAGES[status] })

function parseSaved(raw: string, event: AttendanceEvent): Hex[] | null {
  let value: unknown
  try { value = JSON.parse(raw) } catch { return null }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { schema, chainId, dao, proposalId, entries } = value as Record<string, unknown>
  if (
    schema !== SCHEMA ||
    chainId !== event.chainId ||
    typeof dao !== 'string' || !isAddress(dao, { strict: false }) || dao.toLowerCase() !== event.daoAddress.toLowerCase() ||
    proposalId !== event.proposalId.toString() ||
    !Array.isArray(entries) ||
    !entries.every(entry => typeof entry === 'string' && ENTRY_PATTERN.test(entry))
  ) return null
  // Dedupe defensively so a tampered list can never inflate the count.
  return [...new Set(entries as Hex[])]
}

/** A store scoped to one chain ID, DAO address, and proposal ID. Without storage nothing persists. */
export function createAttendanceStore(storage: AttendanceStorage | undefined, event: AttendanceEvent): AttendanceStore {
  const key = KEY_PREFIX + attendanceEventKey(event)
  let available = storage !== undefined
  return {
    load() {
      if (!storage) return { entries: [], state: state('unavailable') }
      let raw: string | null
      try { raw = storage.getItem(key) } catch {
        available = false
        return { entries: [], state: state('unavailable') }
      }
      if (raw === null) return { entries: [], state: state('saved') }
      const entries = parseSaved(raw, event)
      return entries === null ? { entries: [], state: state('corrupt') } : { entries, state: state('saved') }
    },
    save(entries) {
      if (!storage || !available) return state('unavailable')
      try {
        storage.setItem(key, JSON.stringify({
          schema: SCHEMA,
          chainId: event.chainId,
          dao: event.daoAddress.toLowerCase(),
          proposalId: event.proposalId.toString(),
          entries,
        }))
      } catch {
        return state('save-failed')
      }
      return state('saved')
    },
  }
}
