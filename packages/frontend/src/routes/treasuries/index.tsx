import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import type { TreasuryListResult } from '../../application'
import { app } from '../../applicationInstance'
import { TreasuryCreationPanel } from './-creation'

export const Route = createFileRoute('/treasuries/')({ component: TreasuryListPage })

type ListState = TreasuryListResult | 'loading'

function TreasuryListPage() {
  const [state, setState] = useState<ListState>('loading')
  const deployment = app.readDeployment()

  const load = useCallback(async () => {
    setState('loading')
    setState(await app.listTreasuries())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-14 text-text-primary sm:px-6 lg:py-20">
      <Link
        to="/"
        className="text-sm font-semibold text-binance-yellow hover:text-binance-yellow-hover"
      >
        ← DAO for Clubs
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-binance-yellow">
            Treasuries
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-text-primary sm:text-4xl">
            Discover funding pools
          </h1>
          <p className="mt-3 text-text-secondary">
            Registered on {deployment.chainName}. No wallet connection is required to browse.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-semibold text-text-primary shadow-sm transition-all hover:border-text-secondary hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-page"
        >
          Refresh
        </button>
      </header>

      <TreasuryCreationPanel onCreated={() => void load()} />
      <TreasuryListBody state={state} onRetry={() => void load()} />
    </main>
  )
}

function TreasuryListBody({ state, onRetry }: { state: ListState; onRetry: () => void }) {
  if (state === 'loading') {
    return (
      <p role="status" className="mt-10 text-text-secondary">
        Loading treasuries from the DAO…
      </p>
    )
  }

  if (state.status === 'unconfigured') {
    return (
      <div role="alert" className="mt-10 rounded-xl border border-card-border bg-card p-6">
        <p className="font-semibold text-text-primary">Treasury discovery is not configured</p>
        <p className="mt-1 text-sm text-text-secondary">{state.message}</p>
      </div>
    )
  }

  if (state.status === 'chain-mismatch') {
    return (
      <div
        role="alert"
        className="mt-10 rounded-xl border border-binance-yellow/30 bg-binance-yellow/10 p-6"
      >
        <p className="font-semibold text-binance-yellow">Wrong chain</p>
        <p className="mt-1 text-sm text-text-secondary">
          This deployment requires chain {state.expectedChainId}, but the RPC endpoint reported
          chain {state.actualChainId}. Treasury records were not mixed.
        </p>
        <RetryButton onRetry={onRetry} />
      </div>
    )
  }

  if (state.status === 'rpc-unavailable') {
    return (
      <div
        role="alert"
        className="mt-10 rounded-xl border border-status-error/30 bg-status-error/10 p-6"
      >
        <p className="font-semibold text-status-error">Treasuries could not be loaded</p>
        <p className="mt-1 text-sm text-text-secondary">{state.message}</p>
        <p className="mt-1 font-mono text-xs text-status-error">{state.error}</p>
        <RetryButton onRetry={onRetry} />
      </div>
    )
  }

  if (state.treasuries.length === 0) {
    return (
      <div className="mt-10 rounded-xl border border-card-border bg-card p-6">
        <p className="font-semibold text-text-primary">No treasuries yet</p>
        <p className="mt-1 text-sm text-text-secondary">
          The DAO registry is empty. Treasuries appear here after they are created on-chain.
        </p>
      </div>
    )
  }

  return (
    <ul className="mt-10 space-y-3">
      {state.treasuries.map((treasury) => (
        <li key={treasury.address}>
          <Link
            to="/treasuries/$treasuryAddress"
            params={{ treasuryAddress: treasury.address }}
            className="flex items-center justify-between gap-4 rounded-xl border border-card-border bg-card p-5 shadow-lg shadow-black/30 transition-all hover:border-binance-yellow/40 hover:bg-card-hover"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Treasury address
              </p>
              <p className="mt-1 break-all font-mono text-sm text-text-primary">
                {treasury.address}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-binance-yellow">Inspect →</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="mt-4 rounded-lg bg-status-error px-4 py-1.5 text-sm font-semibold text-white hover:bg-status-error/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-error"
    >
      Try again
    </button>
  )
}
