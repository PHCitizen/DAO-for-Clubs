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
  useEffect(
    () =>
      app.onFundingStateChanged((next) => {
        setState(next)
        if (next.status === 'confirmed') setBalances(next.balances)
      }),
    [app]
  )

  const sender = wallet.status === 'connected' ? wallet.account : undefined
  const shown =
    balances?.treasury.toLowerCase() === treasury.toLowerCase() && balances?.sender === sender
      ? balances
      : undefined

  async function refresh() {
    setError('')
    setBalances(undefined)
    try {
      if (!isAddress(treasury)) throw new Error('Enter a valid treasury address.')
      setBalances(await app.refreshFunding(treasury))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const busy = state.status === 'submitting' || state.status === 'pending'

  return (
    <section
      aria-labelledby="funding-title"
      className="rounded-xl border border-card-border bg-card p-6 sm:p-7 shadow-lg shadow-black/30 transition-all mt-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-page border border-card-border text-binance-yellow">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 id="funding-title" className="text-base sm:text-lg font-semibold text-text-primary">
            Fund a treasury
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-card-border bg-page px-2.5 py-0.5 text-xs font-medium text-text-secondary">
          ERC20 TestUSD
        </span>
      </div>

      <div className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-card-border/60 bg-page/50 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Shared TestUSD
            </p>
            <p className="mt-1 font-mono text-sm text-text-primary break-all">
              {app.readDeployment().testUsdAddress ?? 'Not deployed'}
            </p>
          </div>
          <div className="rounded-lg border border-card-border/60 bg-page/50 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Sender account
            </p>
            <p className="mt-1 font-mono text-sm text-text-primary break-all">
              {sender ?? 'Connect a wallet'}
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1.5">
            Registered treasury address
            <input
              className="mt-1 block w-full rounded-lg border border-card-border bg-page px-3.5 py-2.5 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-binance-yellow focus:outline-none focus:ring-1 focus:ring-binance-yellow disabled:opacity-50 transition-colors"
              placeholder="0x..."
              value={treasury}
              disabled={busy}
              onChange={(e) => {
                setTreasury(e.target.value)
                setBalances(undefined)
              }}
            />
          </label>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1.5">
            TestUSD amount
            <input
              className="mt-1 block w-full rounded-lg border border-card-border bg-page px-3.5 py-2.5 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-binance-yellow focus:outline-none focus:ring-1 focus:ring-binance-yellow disabled:opacity-50 transition-colors"
              placeholder="0.0"
              inputMode="decimal"
              value={amount}
              disabled={busy}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-binance-yellow px-5 py-2.5 text-sm font-semibold text-binance-black shadow-sm transition-all hover:bg-binance-yellow-hover active:bg-binance-yellow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={busy || !sender || !isAddress(treasury)}
            onClick={() => {
              if (isAddress(treasury)) void app.fundTreasury(treasury, amount)
            }}
          >
            <span>Transfer TestUSD</span>
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-card-border bg-page px-4 py-2.5 text-sm font-semibold text-text-primary shadow-sm transition-all hover:border-text-secondary hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow"
            onClick={() => void refresh()}
          >
            <span>Refresh actual balances</span>
          </button>
        </div>

        <div className="rounded-lg border border-card-border/60 bg-page/50 p-3 text-sm text-text-secondary">
          <p role="status">
            {state.status === 'submitting'
              ? 'Awaiting wallet submission…'
              : state.status === 'pending'
              ? `Pending confirmation: ${state.hash}`
              : state.status === 'confirmed'
              ? `Confirmed ${state.amount} TestUSD to ${state.treasury}. Transaction: ${state.hash}`
              : state.status === 'failed' || state.status === 'rejected'
              ? `${state.status}: ${state.message}`
              : 'Direct transfer; no approval required.'}
          </p>
        </div>

        {shown && (
          <div className="rounded-lg border border-status-success/30 bg-status-success/10 p-3 font-mono text-sm text-status-success">
            <p>
              Sender {shown.sender}: {formatUnits(shown.senderBalance, shown.decimals)} TestUSD.
              Treasury {shown.treasury}: {formatUnits(shown.treasuryBalance, shown.decimals)} TestUSD.
            </p>
          </div>
        )}

        {state.status === 'confirmed' && state.refreshError && (
          <div role="alert" className="rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
            <p>Confirmed, but balance refresh failed: {state.refreshError}</p>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
            <p>{error}</p>
          </div>
        )}
      </div>
    </section>
  )
}
