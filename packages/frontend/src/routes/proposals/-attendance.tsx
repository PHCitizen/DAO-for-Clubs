import { useEffect, useRef, useState } from 'react'
import { app } from '../../applicationInstance'
import type { AttendanceScanSession } from '../../application'
import type { AttendanceCollectionView, ScanResult } from '../../attendanceScan'

const scanMessage = (scan: ScanResult) =>
  scan.status === 'rejected' ? scan.message
    : scan.status === 'duplicate' ? 'Already scanned. Count unchanged.'
    : 'Entry accepted.'

/** Organizer attendance scanning for the proposal creator; presentation only. */
export function AttendanceScanPanel({ id }: { id: bigint }) {
  const [view, setView] = useState<AttendanceCollectionView | null>(null)
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState('')
  const sessionRef = useRef<{ session: AttendanceScanSession; detach: () => void } | null>(null)

  function release() {
    const current = sessionRef.current
    sessionRef.current = null
    current?.detach()
    current?.session.stop()
    setScanning(false)
  }

  useEffect(() => release, [])

  async function start() {
    release()
    setMessage('Starting camera…')
    const result = await app.startAttendanceScan({ proposalId: id })
    if (result.status !== 'scanning') { setMessage(result.message); return }
    const { session } = result
    const offScan = session.onScan(scan => { setView(session.read()); setMessage(scanMessage(scan)) })
    const offStop = session.onStop(() => {
      if (sessionRef.current?.session !== session) return
      sessionRef.current = null
      setScanning(false)
      setMessage('Camera stopped. Collected entries are kept for this page session.')
    })
    sessionRef.current = { session, detach: () => { offScan(); offStop() } }
    setView(session.read())
    setScanning(true)
    setMessage('Scanning. Hold an attendee QR in front of the camera.')
  }

  function stop() {
    release()
    setMessage('Camera stopped. Collected entries are kept for this page session.')
  }

  return <section className="mt-8 space-y-3 rounded-xl border border-card-border p-5">
    <h2 className="text-lg font-semibold">Attendance check-in (organizer)</h2>
    <p className="text-sm text-text-secondary">Only the proposal creator can scan. Scans are held in this page only (not yet saved across reloads) and need no blockchain transaction.</p>
    <p>Proposal #{(view?.event.proposalId ?? id).toString()}</p>
    {view && <p className="text-sm text-text-secondary">Chain ID {view.event.chainId} · DAO {view.event.daoAddress}</p>}
    <p>Accepted entries: {view?.count ?? 0}</p>
    {scanning ? <button onClick={stop}>Stop camera</button> : <button onClick={() => void start()}>Start camera</button>}
    {message && <p role="status">{message}</p>}
  </section>
}
