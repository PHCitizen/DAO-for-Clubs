import { useEffect, useRef, useState } from 'react'
import { app } from '../../applicationInstance'
import type { AttendanceScanSession } from '../../application'
import type { AttendanceCollectionView, ScanResult } from '../../attendanceScan'
import type { PreparedAttendanceSet } from '../../attendanceV2'
import QRCode from 'qrcode'

const scanMessage = (scan: ScanResult) =>
  scan.status === 'rejected' ? scan.message
    : scan.status === 'duplicate' ? 'Already scanned. Count unchanged.'
    : scan.saved ? 'Entry accepted and saved in this browser.' : 'Entry accepted but NOT saved. It will be lost on reload.'

/** Organizer attendance scanning for the proposal creator; presentation only. */
export function AttendanceScanPanel({ id }: { id: bigint }) {
  const [view, setView] = useState<AttendanceCollectionView | null>(null)
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<PreparedAttendanceSet | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [qr, setQr] = useState('')
  const [qrImage, setQrImage] = useState('')
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
    const offScan = session.onScan(scan => {
      setView(session.read()); setMessage(scanMessage(scan))
      const current = app.readPreparedAttendanceSet({ proposalId: id })
      setPreview(current.status === 'prepared' ? current.set : null)
    })
    const offStop = session.onStop(() => {
      if (sessionRef.current?.session !== session) return
      sessionRef.current = null
      setScanning(false)
      setMessage('Camera stopped. Collected entries are kept.')
    })
    sessionRef.current = { session, detach: () => { offScan(); offStop() } }
    setView(session.read())
    setScanning(true)
    setMessage('Scanning. Hold an attendee QR in front of the camera.')
  }

  function stop() {
    release()
    setMessage('Camera stopped. Collected entries are kept.')
  }

  useEffect(() => {
    const invalidate = () => {
      const current = app.readPreparedAttendanceSet({ proposalId: id })
      setPreview(current.status === 'prepared' ? current.set : null)
    }
    window.addEventListener('storage', invalidate)
    return () => window.removeEventListener('storage', invalidate)
  }, [id])

  async function prepare() {
    setPreparing(true)
    setPreview(null)
    const result = await app.prepareAttendanceSet({ proposalId: id })
    setPreparing(false)
    const current = app.readPreparedAttendanceSet({ proposalId: id })
    setPreview(current.status === 'prepared' ? current.set : null)
    setMessage(result.status === 'prepared' ? 'Prepared only. Nothing has been pinned or finalized.' : result.message)
  }

  async function credential() {
    setQr('')
    setQrImage('')
    const result = await app.prepareAttendanceCredential({ proposalId: id })
    if (result.status === 'ready') {
      setQr(result.qr)
      setQrImage(await QRCode.toDataURL(result.qr, { width: 360 }))
    }
    else setMessage(result.message)
  }

  return <section className="mt-8 space-y-3 rounded-xl border border-card-border p-5">
    <h2 className="text-lg font-semibold">Attendance check-in (organizer)</h2>
    <p className="text-sm text-text-secondary">Only the proposal creator can scan. Scans are saved in this browser for this event and need no blockchain transaction.</p>
    <p>Proposal #{(view?.event.proposalId ?? id).toString()}</p>
    {view && <p className="text-sm text-text-secondary">Chain ID {view.event.chainId} · DAO {view.event.daoAddress}</p>}
    <p>Accepted entries: {view?.count ?? 0}</p>
    {view && <p role="status" className="text-sm text-text-secondary">{view.storage.message}</p>}
    {scanning ? <button onClick={stop}>Stop camera</button> : <button onClick={() => void start()}>Start camera</button>}
    {message && <p role="status">{message}</p>}
    <button disabled={preparing} onClick={() => void prepare()}>{preparing ? 'Preparing…' : 'Prepare saved attendance preview'}</button>
    {preview && <div className="space-y-2 break-all">
      <h3>Prepared attendance v2</h3>
      <p>Entries: {preview.count}</p>
      <p>Root: <code>{preview.root}</code></p>
      <p role="alert">{preview.warning}</p>
      <details><summary>Exact canonical public dataset</summary><pre className="whitespace-pre-wrap">{preview.bytes}</pre></details>
      <p>Changing saved scans invalidates this preview. No pinning or finalization is available here.</p>
    </div>}
    <h3>Attendee credential</h3>
    <p className="text-sm">Use a deterministic EOA wallet. V2 events require regenerated v2 entries; v1 QR codes cannot be reused.</p>
    <button onClick={() => void credential()}>Recover this event’s public QR payload</button>
    {qr && <pre className="whitespace-pre-wrap break-all">{qr}</pre>}
    {qrImage && <img src={qrImage} width={360} height={360} alt="Public event attendance QR code" />}
  </section>
}
