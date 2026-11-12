import { useEffect, useState } from 'react'
import { formatUnits, isAddress } from 'viem'
import type { Application, FundingBalances } from '../application'

export function FundingPanel({ app }: { app: Application }) {
  const [treasury, setTreasury] = useState('')
  const [amount, setAmount] = useState('')
  const [state, setState] = useState(app.readFundingState())
  const [balances, setBalances] = useState<FundingBalances>()
  const [error, setError] = useState('')
  const [wallet, setWallet] = useState(app.readWalletAccount())
  useEffect(() => app.onWalletStateChanged(setWallet), [app])
  useEffect(() => app.onFundingStateChanged(next => { setState(next); if (next.status === 'confirmed') setBalances(next.balances) }), [app])
  const sender = wallet.status === 'connected' ? wallet.account : undefined
  const shown = balances?.treasury.toLowerCase() === treasury.toLowerCase() && balances?.sender === sender ? balances : undefined
  async function refresh() {
    setError('')
    setBalances(undefined)
    try {
      if (!isAddress(treasury)) throw new Error('Enter a valid treasury address.')
      setBalances(await app.refreshFunding(treasury))
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
  }
  const busy = state.status === 'submitting' || state.status === 'pending'
  return <section className="mt-6 rounded-xl border border-slate-200 p-6">
    <h2 className="text-lg font-semibold">Fund a treasury</h2>
    <p className="break-all">Shared TestUSD: {app.readDeployment().testUsdAddress ?? 'Not deployed'}</p>
    <p className="break-all">Sender: {sender ?? 'Connect a wallet'}</p>
    <label className="block mt-3">Registered treasury address<input className="block w-full border p-2" value={treasury} disabled={busy} onChange={e => { setTreasury(e.target.value); setBalances(undefined) }} /></label>
    <label className="block mt-3">TestUSD amount<input className="block w-full border p-2" inputMode="decimal" value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} /></label>
    <button className="mt-3 mr-4 border p-2" disabled={busy || !sender || !isAddress(treasury)} onClick={() => { if (isAddress(treasury)) void app.fundTreasury(treasury, amount) }}>Transfer TestUSD</button>
    <button className="border p-2" onClick={() => void refresh()}>Refresh actual balances</button>
    <p role="status">{state.status === 'submitting' ? 'Awaiting wallet submission…' : state.status === 'pending' ? `Pending confirmation: ${state.hash}` : state.status === 'confirmed' ? `Confirmed ${state.amount} TestUSD to ${state.treasury}. Transaction: ${state.hash}` : state.status === 'failed' || state.status === 'rejected' ? `${state.status}: ${state.message}` : 'Direct transfer; no approval required.'}</p>
    {shown && <p>Sender {shown.sender}: {formatUnits(shown.senderBalance, shown.decimals)} TestUSD. Treasury {shown.treasury}: {formatUnits(shown.treasuryBalance, shown.decimals)} TestUSD.</p>}
    {state.status === 'confirmed' && state.refreshError && <p role="alert">Confirmed, but balance refresh failed: {state.refreshError}</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
