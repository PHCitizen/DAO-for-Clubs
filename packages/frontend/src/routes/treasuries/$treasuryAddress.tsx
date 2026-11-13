import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import type { TreasuryDetailResult } from '../../application'
import { app } from '../../applicationInstance'
import { MembershipPanel } from './-membership'

export const Route = createFileRoute('/treasuries/$treasuryAddress')({
  component: TreasuryDetailPage,
})

type DetailState = TreasuryDetailResult | 'loading'

function TreasuryDetailPage() {
  const { treasuryAddress } = Route.useParams()
  const [state, setState] = useState<DetailState>('loading')

  const load = useCallback(async () => {
    setState('loading')
    setState(await app.readTreasury(treasuryAddress))
  }, [treasuryAddress])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <Link to="/treasuries" className="text-sm font-semibold text-emerald-700 hover:underline">
        ← All treasuries
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
            Treasury
          </p>
          <h1 className="mt-2 break-all font-mono text-2xl font-bold tracking-tight">
            {treasuryAddress}
          </h1>
          <p className="mt-3 text-slate-600">
            Public administrator, funding asset, and balance. No wallet connection required.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"
        >
          Refresh balance
        </button>
      </header>

      <TreasuryDetailBody state={state} onRetry={() => void load()} />
      {state !== 'loading' && state.status === 'success' && (
        <MembershipPanel app={app} treasuryAddress={state.treasury.address} />
      )}
    </main>
  )
}

function TreasuryDetailBody({ state, onRetry }: { state: DetailState; onRetry: () => void }) {
  if (state === 'loading') {
    return (
      <p role="status" className="mt-10 text-slate-600">
        Loading treasury from the chain…
      </p>
    )
  }

  if (state.status === 'not-found') {
    return (
      <div role="alert" className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p className="font-semibold text-amber-800">Treasury not found</p>
        <p className="mt-1 text-sm text-amber-700">
          {state.reason === 'invalid-address'
            ? 'That is not a valid EVM address.'
            : 'The DAO registry does not record a treasury at this address on the configured chain.'}
        </p>
      </div>
    )
  }

  if (state.status === 'unconfigured') {
    return (
      <div role="alert" className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-6">
        <p className="font-semibold text-slate-800">Treasury inspection is not configured</p>
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
          chain {state.actualChainId}. No treasury data was mixed across deployments.
        </p>
        <RetryButton onRetry={onRetry} />
      </div>
    )
  }

  if (state.status === 'rpc-unavailable') {
    return (
      <div role="alert" className="mt-10 rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="font-semibold text-red-800">Treasury data could not be loaded</p>
        <p className="mt-1 text-sm text-red-700">{state.message}</p>
        <p className="mt-1 font-mono text-xs text-red-600">{state.error}</p>
        <RetryButton onRetry={onRetry} />
      </div>
    )
  }

  const treasury = state.treasury
  return (
    <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
      <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Balance</dt>
          <dd className="mt-1 text-3xl font-bold text-slate-900">
            {treasury.formattedBalance}{' '}
            <span className="text-lg font-semibold text-slate-500">
              {treasury.fundingAssetSymbol}
            </span>
          </dd>
          <dd className="mt-1 text-xs text-slate-500">
            Chain {state.chainId} · {treasury.fundingAssetDecimals} decimals
          </dd>
        </div>

        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Administrator
          </dt>
          <dd className="mt-1 break-all font-mono text-sm text-slate-900">
            {treasury.administrator}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Funding asset
          </dt>
          <dd className="mt-1 break-all font-mono text-sm text-slate-900">
            {treasury.fundingAsset}
          </dd>
          <dd className="mt-1 text-xs text-slate-500">
            {treasury.isSharedFundingAsset === true
              ? 'Shared TestUSD'
              : treasury.isSharedFundingAsset === false
                ? 'Not the configured shared TestUSD'
                : 'Configured shared TestUSD unavailable'}
          </dd>
        </div>
      </dl>
    </section>
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
