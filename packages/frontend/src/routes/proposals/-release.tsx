import { useEffect, useState } from 'react'
import { app } from '../../applicationInstance'
import type { FundingReadResult } from '../../application'

const STATE_TEXT = {
  'not-passed': 'Not passed: no funds can be released.',
  'passed-awaiting-funds': 'Passed; not yet paid.',
  paid: 'Paid: funds were sent to the fixed recipient.',
} as const

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
      if (result.status === 'confirmed') setMessage(`Payment confirmed: ${result.hash}`)
      else if (result.status === 'funds-pending') setMessage(`Not paid: the treasury balance is insufficient. Passing is kept; retry when it is funded. (${result.hash})`)
      else setMessage('message' in result ? result.message : 'Wallet and deployment chains must match.')
      if (result.status === 'confirmed' || result.status === 'funds-pending') {
        if (result.funding) setFunding({ status: 'success', funding: result.funding })
        else setFunding(await app.readFunding(id))
      }
    } finally { setBusy(false) }
  }

  const state = funding?.status === 'success' ? funding.funding.state : null
  return <section className="mt-8 space-y-3 rounded-xl border border-card-border p-5">
    <h2 className="text-lg font-semibold">Funding</h2>
    <p>{state ? STATE_TEXT[state] : `Funding status ${funding ? 'unavailable' : 'loading'}.`}</p>
    <p className="text-sm text-card-muted">Only the proposal creator can release funds, to the fixed recipient, at any time after passing. Passing does not reserve treasury funds.</p>
    <button className="rounded bg-binance-yellow px-4 py-2 text-binance-black disabled:opacity-50"
      disabled={busy || state !== 'passed-awaiting-funds'} onClick={() => void release()}>
      {busy ? 'Confirming…' : 'Release funds (creator)'}
    </button>
    {message && <p role="status" className="break-all">{message}</p>}
  </section>
}
