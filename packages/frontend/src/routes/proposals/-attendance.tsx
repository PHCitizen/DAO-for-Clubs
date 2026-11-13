import { useEffect, useRef, useState } from 'react'
import { app } from '../../applicationInstance'
import type { AttendanceScanSession } from '../../application'
import type { ScanResult } from '../../attendanceScan'

/** Organizer attendance scanning for the proposal creator; presentation only. */
export function AttendanceScanPanel({ id }: { id: bigint }) {
  const [session, setSession] = useState<AttendanceScanSession | null>(null)
  const [count, setCount] = useState(0)
  const [message, setMessage] = useState('')
  const sessionRef = useRef<AttendanceScanSession | null>(null)

  useEffect(() => () => sessionRef.current?.stop(), [])

  async function start() {
    setMessage('Starting camera…')
    const result = await app.startAttendanceScan({ proposalId: id })
    if (result.status !== 'scanning') { setMessage(result.message); return }
    sessionRef.current = result.session
    setSession(result.session)
    setCount(result.session.read().count)
    setMessage('Scanning. Hold an attendee QR in front of the camera.')
    result.session.onScan((scan: ScanResult) => {
      setCount(scan.count)
      setMessage(scan.status === 'accepted' ? 'Entry accepted.' : scan.status === 'duplicate' ? 'Already scanned. Count unchanged.' : scan.message)
    })
  }

  function stop() {
    session?.stop()
    sessionRef.current = null
    setSession(null)
    setMessage('Camera stopped. Collected entries are kept for this page session.')
  }

  return <section className="mt-8 space-y-3 rounded-xl border border-card-border p-5">
    <h2 className="text-lg font-semibold">Attendance check-in (organizer)</h2>
    <p className="text-sm text-text-secondary">Proposal #{id.toString()}. Only the proposal creator can scan. Scans are held in this page only (not yet saved across reloads) and need no blockchain transaction.</p>
    <p>Accepted entries: {count}</p>
    {session ? <button onClick={stop}>Stop camera</button> : <button onClick={() => void start()}>Start camera</button>}
    {message && <p role="status">{message}</p>}
  </section>
}
