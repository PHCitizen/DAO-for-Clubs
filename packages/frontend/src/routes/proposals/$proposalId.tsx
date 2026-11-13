import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import type { PublishedProposalResult } from '../../application'
import { app } from '../../applicationInstance'

export const Route = createFileRoute('/proposals/$proposalId')({ component: ProposalDetailPage })

type DetailState = PublishedProposalResult | 'loading'

function parseId(value: string): bigint | null {
  return /^\d+$/.test(value) ? BigInt(value) : null
}

function ProposalDetailPage() {
  const { proposalId } = Route.useParams()
  const [state, setState] = useState<DetailState>('loading')

  const load = useCallback(async () => {
    const id = parseId(proposalId)
    if (id === null) {
      setState({ status: 'not-found', id: 0n })
      return
    }
    setState('loading')
    setState(await app.readPublishedProposal(id))
  }, [proposalId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-14 text-text-primary sm:px-6 lg:py-20">
      <Link to="/proposals" className="text-sm font-semibold text-binance-yellow hover:text-binance-yellow-hover">
        ← Proposals
      </Link>
      <Body state={state} proposalId={proposalId} onRetry={() => void load()} />
    </main>
  )
}

function Body({ state, proposalId, onRetry }: { state: DetailState; proposalId: string; onRetry: () => void }) {
  if (state === 'loading') {
    return (
      <p role="status" className="mt-10 text-text-secondary">
        Loading proposal #{proposalId}…
      </p>
    )
  }
  if (state.status === 'not-found') {
    return (
      <div role="alert" className="mt-10 rounded-xl border border-card-border bg-card p-6">
        <p className="font-semibold">Proposal #{proposalId} does not exist</p>
        <p className="mt-1 text-sm text-text-secondary">No proposal with that ID is recorded by this DAO.</p>
      </div>
    )
  }
  if (state.status !== 'success') {
    const message =
      state.status === 'chain-mismatch'
        ? `This deployment requires chain ${state.expectedChainId}, but the RPC endpoint reported chain ${state.actualChainId}.`
        : state.message
    return (
      <div role="alert" className="mt-10 rounded-xl border border-status-error/30 bg-status-error/10 p-6">
        <p className="font-semibold text-status-error">The proposal could not be loaded</p>
        <p className="mt-1 text-sm text-text-secondary">{message}</p>
        <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-status-error px-4 py-1.5 text-sm font-semibold text-white">
          Try again
        </button>
      </div>
    )
  }

  const { proposal, document } = state
  const deadline = new Date(Number(proposal.votingDeadline) * 1000).toLocaleString()
  return (
    <article className="mt-6">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        {document.status === 'available' ? document.title : `Proposal #${proposal.id.toString()}`}
      </h1>

      <dl className="mt-6 grid gap-3 rounded-xl border border-card-border bg-card p-5 text-sm">
        <Field label="Deployment" value={`chain ${state.chainId}, DAO ${state.daoAddress}`} mono />
        <Field label="Proposal ID" value={proposal.id.toString()} />
        <Field label="Treasury" value={proposal.treasury} mono />
        <Field label="Creator" value={proposal.creator} mono />
        <Field label="Funding amount" value={`${state.formattedAmount} ${state.symbol}`} />
        <Field label="Voting deadline" value={deadline} />
        <Field label="Document reference" value={proposal.documentReference} mono />
      </dl>

      {document.status === 'available' ? (
        <section
          aria-label="Event information"
          className="mt-8 space-y-3 text-text-secondary [&_a]:text-binance-yellow [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold"
          // Sanitized by the shared Markdown policy after CID verification.
          dangerouslySetInnerHTML={{ __html: document.html }}
        />
      ) : (
        <div role="alert" className="mt-8 rounded-xl border border-binance-yellow/30 bg-binance-yellow/10 p-6">
          <p className="font-semibold text-binance-yellow">Event information is unavailable</p>
          <p className="mt-1 text-sm text-text-secondary">{document.message}</p>
          <p className="mt-1 text-sm text-text-secondary">The on-chain proposal record above is unaffected.</p>
          {document.retryable ? (
            <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-binance-yellow px-4 py-1.5 text-sm font-semibold text-black">
              Retry
            </button>
          ) : null}
        </div>
      )}
    </article>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{label}</dt>
      <dd className={`mt-0.5 break-all ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
