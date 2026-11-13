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

export type AttendanceStorageStatus = 'empty' | 'saved' | 'save-failed' | 'unavailable' | 'corrupt'

/** Honest persistence state: 'saved' means an entry was written or restored; 'empty' means nothing is saved yet. */
export interface AttendanceStorageState {
  status: AttendanceStorageStatus
  message: string
}

export const STORAGE_MESSAGES: Record<AttendanceStorageStatus, string> = {
  empty: 'Nothing saved in this browser yet.',
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

const storageState = (status: AttendanceStorageStatus): AttendanceStorageState => ({ status, message: STORAGE_MESSAGES[status] })

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
  // Duplicates mean the saved list was tampered with or damaged: do not hide it.
  if (new Set(entries).size !== entries.length) return null
  return entries as Hex[]
}

/** A store scoped to one chain ID, DAO address, and proposal ID. Without storage nothing persists. */
export function createAttendanceStore(storage: AttendanceStorage | undefined, event: AttendanceEvent): AttendanceStore {
  const key = KEY_PREFIX + attendanceEventKey(event)
  const empty = (status: AttendanceStorageStatus) => ({ entries: [] as Hex[], state: storageState(status) })
  return {
    load() {
      if (!storage) return empty('unavailable')
      let raw: string | null
      try { raw = storage.getItem(key) } catch { return empty('unavailable') }
      if (raw === null) return empty('empty')
      const entries = parseSaved(raw, event)
      if (entries === null) return empty('corrupt')
      return { entries, state: storageState(entries.length === 0 ? 'empty' : 'saved') }
    },
    save(entries) {
      if (!storage) return storageState('unavailable')
      try {
        storage.setItem(key, JSON.stringify({
          schema: SCHEMA,
          chainId: event.chainId,
          dao: event.daoAddress.toLowerCase(),
          proposalId: event.proposalId.toString(),
          entries,
        }))
      } catch {
        return storageState('save-failed')
      }
      return storageState('saved')
    },
  }
}
