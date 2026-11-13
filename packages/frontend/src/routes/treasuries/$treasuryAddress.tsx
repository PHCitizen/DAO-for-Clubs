import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import type { TreasuryDetailResult } from '../../application'
import { app } from '../../applicationInstance'

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
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-14 text-text-primary sm:px-6 lg:py-20">
      <Link
        to="/treasuries"
        className="text-sm font-semibold text-binance-yellow hover:text-binance-yellow-hover"
      >
        ← All treasuries
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-binance-yellow">
            Treasury
          </p>
          <h1 className="mt-2 break-all font-mono text-2xl font-bold tracking-tight text-text-primary">
            {treasuryAddress}
          </h1>
          <p className="mt-3 text-text-secondary">
            Public administrator, funding asset, and balance. No wallet connection required.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-semibold text-text-primary shadow-sm transition-all hover:border-text-secondary hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-page"
        >
          Refresh balance
        </button>
      </header>

      <TreasuryDetailBody state={state} onRetry={() => void load()} />
    </main>
  )
}

function TreasuryDetailBody({ state, onRetry }: { state: DetailState; onRetry: () => void }) {
  if (state === 'loading') {
    return (
      <p role="status" className="mt-10 text-text-secondary">
        Loading treasury from the chain…
      </p>
    )
  }

  if (state.status === 'not-found') {
    return (
      <div
        role="alert"
        className="mt-10 rounded-xl border border-binance-yellow/30 bg-binance-yellow/10 p-6"
      >
        <p className="font-semibold text-binance-yellow">Treasury not found</p>
        <p className="mt-1 text-sm text-text-secondary">
          {state.reason === 'invalid-address'
            ? 'That is not a valid EVM address.'
            : 'The DAO registry does not record a treasury at this address on the configured chain.'}
        </p>
      </div>
    )
  }

  if (state.status === 'unconfigured') {
    return (
      <div role="alert" className="mt-10 rounded-xl border border-card-border bg-card p-6">
        <p className="font-semibold text-text-primary">Treasury inspection is not configured</p>
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
          chain {state.actualChainId}. No treasury data was mixed across deployments.
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
        <p className="font-semibold text-status-error">Treasury data could not be loaded</p>
        <p className="mt-1 text-sm text-text-secondary">{state.message}</p>
        <p className="mt-1 font-mono text-xs text-status-error">{state.error}</p>
        <RetryButton onRetry={onRetry} />
      </div>
    )
  }

  const treasury = state.treasury
  return (
    <section className="mt-10 rounded-xl border border-card-border bg-card p-6 shadow-lg shadow-black/30">
      <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Balance
          </dt>
          <dd className="mt-1 text-3xl font-bold text-text-primary">
            {treasury.formattedBalance}{' '}
            <span className="text-lg font-semibold text-text-secondary">
              {treasury.fundingAssetSymbol}
            </span>
          </dd>
          <dd className="mt-1 text-xs text-text-tertiary">
            Chain {state.chainId} · {treasury.fundingAssetDecimals} decimals
          </dd>
        </div>

        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Administrator
          </dt>
          <dd className="mt-1 break-all font-mono text-sm text-text-primary">
            {treasury.administrator}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Funding asset
          </dt>
          <dd className="mt-1 break-all font-mono text-sm text-text-primary">
            {treasury.fundingAsset}
          </dd>
          <dd className="mt-1 text-xs text-text-tertiary">
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
      className="mt-4 rounded-lg bg-status-error px-4 py-1.5 text-sm font-semibold text-white hover:bg-status-error/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-error"
    >
      Try again
    </button>
  )
}
