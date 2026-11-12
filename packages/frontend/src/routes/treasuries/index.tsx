import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import type { TreasuryListResult } from '../../application'
import { app } from '../../applicationInstance'

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
    <main className="mx-auto max-w-3xl px-6 py-20">
      <Link to="/" className="text-sm font-semibold text-emerald-700 hover:underline">
        ← DAO for Clubs
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
            Treasuries
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">Discover funding pools</h1>
          <p className="mt-3 text-slate-600">
            Registered on {deployment.chainName}. No wallet connection is required to browse.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"
        >
          Refresh
        </button>
      </header>

      <TreasuryListBody state={state} onRetry={() => void load()} />
    </main>
  )
}

function TreasuryListBody({ state, onRetry }: { state: ListState; onRetry: () => void }) {
  if (state === 'loading') {
    return (
      <p role="status" className="mt-10 text-slate-600">
        Loading treasuries from the DAO…
      </p>
    )
  }

  if (state.status === 'unconfigured') {
    return (
      <div role="alert" className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-6">
        <p className="font-semibold text-slate-800">Treasury discovery is not configured</p>
        <p className="mt-1 text-sm text-slate-600">{state.message}</p>
      </div>
    )
  }

  if (state.status === 'chain-mismatch') {
    return (
      <div role="alert" className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p className="font-semibold text-amber-800">Wrong chain</p>
        <p className="mt-1 text-sm text-amber-700">
          This deployment requires chain {state.expectedChainId}, but the RPC endpoint reported
          chain {state.actualChainId}. Treasury records were not mixed.
        </p>
        <RetryButton onRetry={onRetry} />
      </div>
    )
  }

  if (state.status === 'rpc-unavailable') {
    return (
      <div role="alert" className="mt-10 rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="font-semibold text-red-800">Treasuries could not be loaded</p>
        <p className="mt-1 text-sm text-red-700">{state.message}</p>
        <p className="mt-1 font-mono text-xs text-red-600">{state.error}</p>
        <RetryButton onRetry={onRetry} />
      </div>
    )
  }

  if (state.treasuries.length === 0) {
    return (
      <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
        <p className="font-semibold text-slate-800">No treasuries yet</p>
        <p className="mt-1 text-sm text-slate-600">
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
            className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 hover:border-emerald-300 hover:bg-emerald-50/40"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Treasury address
              </p>
              <p className="mt-1 break-all font-mono text-sm text-slate-900">{treasury.address}</p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-emerald-700">Inspect →</span>
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
      className="mt-4 rounded-lg bg-red-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
    >
      Try again
    </button>
  )
}
