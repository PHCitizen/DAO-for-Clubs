import { useState } from 'react'
import { app } from '../../applicationInstance'
import type { PreparedPrivateAttendanceWitness } from '../../application'

function download(fileName: string, file: string) {
  const url = URL.createObjectURL(new Blob([file], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Attendee proof preparation for one event. The UI never receives the secret,
 * signature, entry or membership path: the action returns an opaque witness
 * handle and a download-ready proof file.
 */
export function PrivateAttendanceProofPanel({ id }: { id: bigint }) {
  const [witness, setWitness] = useState<PreparedPrivateAttendanceWitness | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function prepare() {
    setBusy(true)
    setWitness(null)
    setMessage('Recovering the credential and validating the published attendance set…')
    const result = await app.preparePrivateAttendanceWitness({ proposalId: id })
    setBusy(false)
    if (result.status !== 'ready') { setMessage(result.message); return }
    setWitness(result.witness)
    setMessage('Membership witness prepared locally. Generate the proof to create a shareable file.')
  }

  async function generate() {
    if (!witness) return
    setBusy(true)
    setMessage('Generating the private proof in this browser…')
    const result = await witness.generate()
    setBusy(false)
    if (result.status !== 'ready') { setMessage(result.message); return }
    download(result.fileName, result.file)
    setMessage(`Proof generated and downloaded. It covers ${result.count} published entries and contains no wallet, secret, entry or path.`)
  }

  return <section className="mt-8 space-y-3 rounded-xl border border-card-border p-5">
    <h2 className="text-lg font-semibold">Private attendance proof (attendee)</h2>
    <p className="text-sm text-text-secondary">
      Recover your attendance credential and prove membership in the finalized attendance set without revealing your wallet or entry.
      The credential and proof are transferable; a valid proof is organizer-attested attendance, not personal identity, payment, or voting approval.
    </p>
    <p className="text-xs text-text-secondary">
      No trusted setup is used. Proving runs locally in your browser; nothing is sent to an application backend.
    </p>
    <div className="flex flex-wrap gap-2">
      <button disabled={busy} onClick={() => void prepare()}>Prepare private witness</button>
      <button disabled={busy || !witness} onClick={() => void generate()}>Generate and download proof</button>
    </div>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>
}

/**
 * Wallet-free verification for anyone holding a proof file. The authenticated
 * event root is read from the configured chain, never from the file.
 */
export function PrivateAttendanceVerifierPanel() {
  const [file, setFile] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function verify() {
    if (!file) return
    setBusy(true)
    setMessage('Checking the event commitment on chain and verifying the proof off-chain…')
    const result = await app.verifyPrivateAttendancePresentation(file)
    setBusy(false)
    setMessage(result.message)
  }

  return <section className="mt-8 space-y-3 rounded-xl border border-card-border p-5">
    <h2 className="text-lg font-semibold">Verify a private attendance proof</h2>
    <p className="text-sm text-text-secondary">
      Import a proof file to check attendance without connecting a wallet or sending a transaction.
      The event root is read from the configured chain, so a file cannot authenticate an invented event.
      Chain access is still required: this is off-chain verification, not guaranteed offline verification.
    </p>
    <input
      type="file"
      accept="application/json,.json"
      onChange={async event => {
        const selected = event.target.files?.[0]
        setFile(selected ? await selected.text() : null)
        setMessage('')
      }}
    />
    <button disabled={busy || !file} onClick={() => void verify()}>Verify imported proof</button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>
}
