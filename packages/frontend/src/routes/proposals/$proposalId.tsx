import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import type { PublishedProposalResult } from '../../application'
import { app } from '../../applicationInstance'
import { ReadFailure } from './-ReadFailure'
import { AttendanceScanPanel } from './-attendance'
import { ProposalVotingPanel } from './-vote'
import { PublicBallotList } from './-ballots'
import { ProposalFundingPanel } from './-release'

export const Route = createFileRoute('/proposals/$proposalId')({ component: ProposalDetailPage })

/** `invalid-id` is a page-level state: the URL segment is not a proposal ID at all. */
type DetailState = PublishedProposalResult | 'loading' | 'invalid-id'

function parseId(value: string): bigint | null {
  return /^\d+$/.test(value) ? BigInt(value) : null
}

function ProposalDetailPage() {
  const { proposalId } = Route.useParams()
  const [state, setState] = useState<DetailState>('loading')
  const numericId = parseId(proposalId)

  const load = useCallback(async () => {
    const id = parseId(proposalId)
    if (id === null) {
      setState('invalid-id')
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
      {numericId !== null && (
        <>
          <ProposalVotingPanel key={proposalId} id={numericId} />
          <PublicBallotList key={`ballots-${proposalId}`} id={numericId} />
          <ProposalFundingPanel key={`funding-${proposalId}`} id={numericId} />
          <AttendanceScanPanel key={`attendance-${proposalId}`} id={numericId} />
        </>
      )}
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
  if (state === 'invalid-id') {
    return (
      <div role="alert" className="mt-10 rounded-xl border border-card-border bg-card p-6">
        <p className="font-semibold">&ldquo;{proposalId}&rdquo; is not a valid proposal ID</p>
        <p className="mt-1 text-sm text-text-secondary">Proposal IDs are whole numbers.</p>
      </div>
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
    return <ReadFailure failure={state} title="The proposal could not be loaded" onRetry={onRetry} />
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
          aria-label="Proposal document"
          className="mt-8 space-y-3 text-text-secondary [&_a]:text-binance-yellow [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold"
          // Sanitized by the shared Markdown policy after CID verification.
          dangerouslySetInnerHTML={{ __html: document.html }}
        />
      ) : (
        <div role="alert" className="mt-8 rounded-xl border border-binance-yellow/30 bg-binance-yellow/10 p-6">
          <p className="font-semibold text-binance-yellow">The proposal document is unavailable</p>
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
