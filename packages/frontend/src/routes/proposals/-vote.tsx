import { useEffect, useState } from 'react'
import { app } from '../../applicationInstance'
import type { VotingReadResult } from '../../application'
import { useNetworkState, useWalletState } from '../../walletState'

/** Voting stays available independently of proposal-document retrieval. */
export function ProposalVotingPanel({ id }: { id: bigint }) {
  const [voting, setVoting] = useState<VotingReadResult | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const wallet = useWalletState()
  const network = useNetworkState()

  useEffect(() => {
    let active = true
    void app.readVoting(id).then(value => { if (active) setVoting(value) })
    return () => { active = false }
  }, [id])

  async function vote() {
    if (!/^\d+$/.test(token)) { setMessage('Enter a voting NFT token ID.'); return }
    setBusy(true)
    setMessage('Waiting for your wallet and chain confirmation…')
    try {
      const result = await app.voteYes(id, BigInt(token))
      if (result.status === 'confirmed') {
        setMessage(`Yes ballot confirmed: ${result.hash}${result.progress ? '' : '. Progress refresh unavailable; refresh before another vote.'}`)
        if (result.progress) setVoting({ status: 'success', progress: result.progress })
      } else setMessage('message' in result ? result.message : 'Wallet and deployment chains must match.')
    } finally { setBusy(false) }
  }

  return <section className="mt-8 space-y-4 rounded-xl border border-card-border p-5">
    <h2 className="text-lg font-semibold">Public yes vote</h2>
    {voting?.status === 'success' ? <p>{voting.progress.yesVotes.toString()} yes · current threshold {voting.progress.threshold.toString()} · {voting.progress.outcome}</p> : <p>Voting progress {voting ? 'unavailable' : 'loading'}.</p>}
    <p>Each treasury NFT votes once per proposal. Administrators control live supply; there is no snapshot. Passing closes voting and does not reserve funds. A ballot is public, not attendance or payment.</p>
    <label className="block">Voting NFT token ID
      <input className="ml-3 rounded border border-card-border bg-page p-2" value={token} onChange={event => setToken(event.target.value)} inputMode="numeric" />
    </label>
    {wallet.status !== 'connected' ? <button onClick={() => void app.connect()}>Connect holder wallet</button>
      : network.status !== 'matched' ? <button onClick={() => void app.switchNetwork()}>Switch to deployment network</button>
      : <button className="rounded bg-binance-yellow px-4 py-2 text-binance-black disabled:opacity-50" disabled={busy || voting?.status !== 'success' || voting.progress.outcome !== 'open'} onClick={() => void vote()}>{busy ? 'Confirming…' : 'Vote yes'}</button>}
    <button className="ml-4" disabled={busy} onClick={() => void app.readVoting(id).then(setVoting)}>Refresh chain result</button>
    {message && <p role="status" className="break-all">{message}</p>}
  </section>
}
