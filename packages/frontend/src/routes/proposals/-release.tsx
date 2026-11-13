import { useEffect, useState } from 'react'
import { app } from '../../applicationInstance'
import type { FundingReadResult } from '../../application'

/** Funding is shown separately from the vote result and attendance. */
export function ProposalFundingPanel({ id }: { id: bigint }) {
  const [funding, setFunding] = useState<FundingReadResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    void app.readFunding(id).then(value => { if (active) setFunding(value) })
    return () => { active = false }
  }, [id])

  async function release() {
    setBusy(true)
    setMessage('Waiting for your wallet and chain confirmation…')
    try {
      const result = await app.releaseFunds(id)
      setMessage(result.message)
      if ('funding' in result) setFunding(result.funding)
    } finally { setBusy(false) }
  }

  return <section className="mt-8 space-y-3 rounded-xl border border-card-border p-5">
    <h2 className="text-lg font-semibold">Funding</h2>
    <p>{funding ? funding.statusText : 'Funding status loading.'}</p>
    <p className="text-sm text-card-muted">Only the proposal creator can release funds, to the fixed recipient, at any time after passing. Passing does not reserve treasury funds.</p>
    <button className="rounded bg-binance-yellow px-4 py-2 text-binance-black disabled:opacity-50"
      disabled={busy || !funding?.canRelease} onClick={() => void release()}>
      {busy ? 'Confirming…' : 'Release funds (creator)'}
    </button>
    {message && <p role="status" className="break-all">{message}</p>}
  </section>
}
