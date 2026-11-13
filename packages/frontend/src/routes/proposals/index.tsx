import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import type { ProposalListResult } from '../../application'
import { app } from '../../applicationInstance'

export const Route = createFileRoute('/proposals/')({ component: ProposalListPage })

type ListState = ProposalListResult | 'loading'

function ProposalListPage() {
  const [state, setState] = useState<ListState>('loading')
  const deployment = app.readDeployment()

  const load = useCallback(async () => {
    setState('loading')
    setState(await app.listProposals())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-14 text-text-primary sm:px-6 lg:py-20">
      <Link to="/" className="text-sm font-semibold text-binance-yellow hover:text-binance-yellow-hover">
        ← DAO for Clubs
      </Link>
      <header className="mt-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-binance-yellow">Proposals</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Event proposals</h1>
        <p className="mt-3 text-text-secondary">
          Recorded on {deployment.chainName}. No wallet connection is required to read them.
        </p>
      </header>
      <Body state={state} onRetry={() => void load()} />
    </main>
  )
}

function Body({ state, onRetry }: { state: ListState; onRetry: () => void }) {
  if (state === 'loading') {
    return (
      <p role="status" className="mt-10 text-text-secondary">
        Loading proposals from the DAO…
      </p>
    )
  }
  if (state.status !== 'success') {
    const message =
      state.status === 'chain-mismatch'
        ? `This deployment requires chain ${state.expectedChainId}, but the RPC endpoint reported chain ${state.actualChainId}.`
        : state.message
    return (
      <div role="alert" className="mt-10 rounded-xl border border-status-error/30 bg-status-error/10 p-6">
        <p className="font-semibold text-status-error">Proposals could not be loaded</p>
        <p className="mt-1 text-sm text-text-secondary">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-status-error px-4 py-1.5 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    )
  }
  if (state.proposals.length === 0) {
    return (
      <div className="mt-10 rounded-xl border border-card-border bg-card p-6">
        <p className="font-semibold">No proposals yet</p>
      </div>
    )
  }
  return (
    <ul className="mt-10 space-y-3">
      {state.proposals.map(({ proposal, formattedAmount, symbol }) => (
        <li key={proposal.id.toString()}>
          <Link
            to="/proposals/$proposalId"
            params={{ proposalId: proposal.id.toString() }}
            className="block rounded-xl border border-card-border bg-card p-5 transition-all hover:border-binance-yellow/40 hover:bg-card-hover"
          >
            <p className="font-semibold">Proposal #{proposal.id.toString()}</p>
            <p className="mt-1 text-sm text-text-secondary">
              {formattedAmount} {symbol} from treasury{' '}
              <span className="break-all font-mono">{proposal.treasury}</span>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
