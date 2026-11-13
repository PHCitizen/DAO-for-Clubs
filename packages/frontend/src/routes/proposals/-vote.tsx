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

  async function vote(choice: 'yes' | 'no') {
    if (!/^\d+$/.test(token)) { setMessage('Enter a voting NFT token ID.'); return }
    setBusy(true)
    setMessage('Waiting for your wallet and chain confirmation…')
    try {
      const result = await (choice === 'yes' ? app.voteYes(id, BigInt(token)) : app.voteNo(id, BigInt(token)))
      if (result.status === 'confirmed') {
        setMessage(`${choice === 'yes' ? 'Yes' : 'No'} ballot confirmed: ${result.hash}${result.progress ? '' : '. Progress refresh unavailable; refresh before another vote.'}`)
        if (result.progress) setVoting({ status: 'success', progress: result.progress })
      } else setMessage('message' in result ? result.message : 'Wallet and deployment chains must match.')
    } finally { setBusy(false) }
  }

  /**
   * Anyone can trigger this permissionless check to re-evaluate retained yes
   * votes against the current threshold after membership changes, without
   * casting a new ballot. It is strictly a vote-passing determination: it
   * never releases funds and is not an administrative approval.
   */
  async function checkPassing() {
    setBusy(true)
    setMessage('Checking whether recorded yes votes now meet the current threshold…')
    try {
      const result = await app.checkPassing(id)
      if (result.status === 'confirmed') {
        setMessage(`Passing check confirmed (vote result only, no funds released): ${result.hash}${result.progress ? '' : '. Progress refresh unavailable; refresh before checking again.'}`)
        if (result.progress) setVoting({ status: 'success', progress: result.progress })
      } else setMessage('message' in result ? result.message : 'Wallet and deployment chains must match.')
    } finally { setBusy(false) }
  }

  return <section className="mt-8 space-y-4 rounded-xl border border-card-border p-5">
    <h2 className="text-lg font-semibold">Public vote</h2>
    {voting?.status === 'success' ? <p>{voting.progress.yesVotes.toString()} yes · {voting.progress.noVotes.toString()} no · current threshold {voting.progress.threshold.toString()} · {voting.progress.outcome}</p> : <p>Voting progress {voting ? 'unavailable' : 'loading'}.</p>}
    <p>Each treasury NFT votes once per proposal. Administrators control live supply; there is no snapshot. Passing closes voting and does not reserve funds. A ballot is public, not attendance or payment.</p>
    <label className="block">Voting NFT token ID
      <input className="ml-3 rounded border border-card-border bg-page p-2" value={token} onChange={event => setToken(event.target.value)} inputMode="numeric" />
    </label>
    {wallet.status !== 'connected' ? <button onClick={() => void app.connect()}>Connect holder wallet</button>
      : network.status !== 'matched' ? <button onClick={() => void app.switchNetwork()}>Switch to deployment network</button>
      : <>{(['yes', 'no'] as const).map(choice => <button key={choice} className="mr-3 rounded bg-binance-yellow px-4 py-2 text-binance-black disabled:opacity-50" disabled={busy || voting?.status !== 'success' || voting.progress.outcome !== 'open'} onClick={() => void vote(choice)}>{busy ? 'Confirming…' : `Vote ${choice}`}</button>)}</>}
    <button className="ml-4" disabled={busy} onClick={() => void app.readVoting(id).then(setVoting)}>Refresh chain result</button>
    <div className="space-y-1">
      <button
        className="rounded border border-card-border px-4 py-2 disabled:opacity-50"
        disabled={busy || voting?.status !== 'success' || voting.progress.outcome !== 'open'}
        onClick={() => void checkPassing()}
      >
        {busy ? 'Checking…' : 'Check passing (anyone; re-evaluates recorded votes, not a new vote)'}
      </button>
      <p className="text-sm text-card-muted">
        This is a vote-passing check only. It never releases funds and is not an administrative approval; it records the same result a qualifying ballot would, when membership changes (for example burns) make retained yes votes sufficient.
      </p>
    </div>
    {message && <p role="status" className="break-all">{message}</p>}
  </section>
}
