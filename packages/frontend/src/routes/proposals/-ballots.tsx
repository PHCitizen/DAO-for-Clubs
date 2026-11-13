import { useEffect, useState } from 'react'
import { app } from '../../applicationInstance'
import type { BallotListResult, VotingReadResult } from '../../application'
import { ReadFailure } from './-ReadFailure'

/**
 * Public, wallet-free ballot inspection. Deliberately its own section, visually
 * and structurally separate from funding/payout and attendance status: a
 * visitor must never be able to infer either from this view.
 */
export function PublicBallotList({ id }: { id: bigint }) {
  const [ballots, setBallots] = useState<BallotListResult | null>(null)
  const [voting, setVoting] = useState<VotingReadResult | null>(null)

  const load = () => {
    setBallots(null)
    setVoting(null)
    void app.readBallots(id).then(setBallots)
    void app.readVoting(id).then(setVoting)
  }

  useEffect(() => { load() }, [id])

  const qualifiesButNotRecorded =
    voting?.status === 'success' &&
    voting.progress.outcome === 'open' &&
    voting.progress.yesVotes >= voting.progress.threshold

  return (
    <section className="mt-8 space-y-4 rounded-xl border border-card-border p-5" aria-label="Public ballots">
      <h2 className="text-lg font-semibold">Public ballots</h2>
      <p className="text-sm text-card-muted">
        Treasury administrators control the live voting NFT supply, and therefore the current threshold; there is no
        membership snapshot. A tally that currently meets the threshold is not the same as a recorded passing result
        &mdash; passing is only official once it is explicitly recorded on-chain, either by a qualifying ballot or an
        explicit passing check.
      </p>

      {voting === null ? (
        <p role="status">Loading voting outcome&hellip;</p>
      ) : voting.status === 'not-found' ? (
        <p>No proposal with this ID is recorded.</p>
      ) : voting.status !== 'success' ? (
        <ReadFailure failure={voting} title="Voting outcome could not be loaded" onRetry={load} />
      ) : (
        <div className="space-y-1">
          <p>
            {voting.progress.yesVotes.toString()} yes &middot; {voting.progress.noVotes.toString()} no &middot; current
            threshold {voting.progress.threshold.toString()} &middot; outcome: <strong>{outcomeLabel(voting.progress.outcome)}</strong>
          </p>
          {qualifiesButNotRecorded && (
            <p role="status" className="text-sm text-binance-yellow">
              The current tally would currently qualify to pass, but passing has not been recorded on-chain yet. This
              is not the same as a passed proposal; anyone can submit the passing check to record it.
            </p>
          )}
        </div>
      )}

      {ballots === null ? (
        <p role="status">Loading ballots&hellip;</p>
      ) : ballots.status === 'not-found' ? (
        <p>No proposal with this ID is recorded.</p>
      ) : ballots.status !== 'success' ? (
        <ReadFailure failure={ballots} title="Public ballots could not be loaded" onRetry={load} />
      ) : ballots.ballots.length === 0 ? (
        <p className="text-sm text-card-muted">No ballots have been cast yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-text-secondary">
              <th className="pr-4">Token ID</th>
              <th className="pr-4">Voter</th>
              <th>Choice</th>
            </tr>
          </thead>
          <tbody>
            {ballots.ballots.map(ballot => (
              <tr key={`${ballot.tokenId}-${ballot.choice}`}>
                <td className="pr-4">{ballot.tokenId.toString()}</td>
                <td className="pr-4 break-all font-mono">{ballot.voter}</td>
                <td>{ballot.choice}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" className="rounded border border-card-border px-4 py-2" onClick={load}>
        Refresh public ballots
      </button>
      <p className="text-xs text-card-muted">
        A public ballot records voting support or opposition only. It is not attendance at the event and not a
        funding or payment record.
      </p>
    </section>
  )
}

function outcomeLabel(outcome: 'open' | 'passed' | 'closed-without-passing'): string {
  switch (outcome) {
    case 'open': return 'open'
    case 'passed': return 'recorded as passed'
    case 'closed-without-passing': return 'closed without passing'
  }
}
