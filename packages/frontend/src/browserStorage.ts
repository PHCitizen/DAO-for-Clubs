import type { AttendanceStorage } from './attendanceStorage'

/** Reading `localStorage` itself can throw when site data is blocked; that means no storage. */
export function browserAttendanceStorage(): AttendanceStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}
