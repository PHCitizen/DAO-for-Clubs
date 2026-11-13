import { useEffect, useState } from 'react'
import type { Application } from '../../application'
import { useNetworkState, useWalletState } from '../../walletState'

/**
 * Creates an on-chain proposal from the currently pinned document. Kept out of
 * the editor route file so the three workflows (draft, pin, create) stay small.
 */
export function ProposalCreationPanel({ app }: { app: Application }) {
  const [pinState, setPinState] = useState(app.readProposalPinState())
  const [creation, setCreation] = useState(app.readProposalCreationState())
  const [treasuries, setTreasuries] = useState<string[]>([])
  const [treasury, setTreasury] = useState('')
  const [amount, setAmount] = useState('')
  const [deadline, setDeadline] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const wallet = useWalletState()
  const network = useNetworkState()

  useEffect(() => app.onProposalPinStateChanged(setPinState), [app])
  useEffect(() => app.onProposalCreationStateChanged(setCreation), [app])

  useEffect(() => {
    let active = true
    void app.listTreasuries().then((result) => {
      if (!active || result.status !== 'success') return
      const addresses = result.treasuries.map((entry) => entry.address)
      setTreasuries(addresses)
      setTreasury((current) => current || addresses[0] || '')
    })
    return () => {
      active = false
    }
  }, [app])

  const isPinned = pinState.status === 'pinned'
  const busy = creation.status === 'submitting' || creation.status === 'pending'
  const wrongNetwork = network.status === 'mismatched'
  const canSubmit =
    isPinned && wallet.status === 'connected' && !wrongNetwork && !busy && treasury.length > 0

  async function handleCreate() {
    setFormError(null)
    const votingDeadline = Math.floor(new Date(deadline).getTime() / 1000)
    const result = await app.createProposal({ treasury, amount, votingDeadline })
    if (result.status === 'created' || result.status === 'failed' || result.status === 'rejected') {
      setFormError(null)
      return
    }
    setFormError(result.message)
  }

  return (
    <section
      aria-labelledby="proposal-create-title"
      className="mt-6 rounded-xl border border-card-border bg-card p-6 shadow-lg shadow-black/30 sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border pb-4">
        <h2 id="proposal-create-title" className="text-base font-semibold text-text-primary sm:text-lg">
          Create the on-chain proposal
        </h2>
        <span className="rounded-full border border-card-border bg-page px-2.5 py-0.5 text-xs font-medium text-text-secondary">
          Immutable terms · DAO-wide ID
        </span>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-text-secondary">
        Creation fixes the treasury, your organizer account as creator and payout recipient, the
        TestUSD amount, the voting deadline, and the pinned document reference. None of these can be
        edited afterwards. Anyone may propose, even with zero voting NFTs.
      </p>

      {!isPinned && (
        <p role="status" className="mt-4 rounded-lg border border-dashed border-card-border bg-page/50 p-4 text-sm text-text-secondary">
          Pin the reviewed document first. An obsolete reference is never submitted after a draft
          edit.
        </p>
      )}

      {isPinned && (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg border border-card-border/60 bg-page/50 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Proposal document
            </p>
            <p className="mt-1 break-all font-mono text-xs text-text-primary">
              {pinState.pin.reference}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="proposal-treasury"
                className="block text-xs font-semibold uppercase tracking-wider text-text-secondary"
              >
                Registered treasury
              </label>
              <select
                id="proposal-treasury"
                value={treasury}
                onChange={(event) => setTreasury(event.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-card-border bg-page px-3.5 py-2.5 font-mono text-xs text-text-primary focus:border-binance-yellow focus:outline-none focus:ring-1 focus:ring-binance-yellow"
              >
                {treasuries.length === 0 && <option value="">No registered treasuries</option>}
                {treasuries.map((address) => (
                  <option key={address} value={address}>
                    {address}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="proposal-amount"
                className="block text-xs font-semibold uppercase tracking-wider text-text-secondary"
              >
                Requested amount (TestUSD)
              </label>
              <input
                id="proposal-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="500"
                className="mt-1.5 block w-full rounded-lg border border-card-border bg-page px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-binance-yellow focus:outline-none focus:ring-1 focus:ring-binance-yellow"
              />
            </div>
            <div>
              <label
                htmlFor="proposal-deadline"
                className="block text-xs font-semibold uppercase tracking-wider text-text-secondary"
              >
                Voting deadline
              </label>
              <input
                id="proposal-deadline"
                type="datetime-local"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-card-border bg-page px-3.5 py-2.5 text-sm text-text-primary focus:border-binance-yellow focus:outline-none focus:ring-1 focus:ring-binance-yellow"
              />
            </div>
            <div className="rounded-lg border border-card-border/60 bg-page/50 p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Creator &amp; payout recipient
              </p>
              <p className="mt-1 break-all font-mono text-xs text-text-primary">
                {wallet.status === 'connected' ? wallet.account : 'Connect a wallet'}
              </p>
            </div>
          </div>

          {wallet.status !== 'connected' ? (
            <button
              type="button"
              onClick={() => void app.connect()}
              className="rounded-lg border border-card-border bg-page px-4 py-2 text-sm font-semibold text-text-primary hover:border-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow"
            >
              Connect organizer wallet
            </button>
          ) : wrongNetwork ? (
            <button
              type="button"
              onClick={() => void app.switchNetwork()}
              className="rounded-lg bg-binance-yellow px-4 py-2 text-sm font-semibold text-binance-black hover:bg-binance-yellow-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow"
            >
              Switch to {network.configuredChainName}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!canSubmit}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-binance-yellow px-5 py-2.5 text-sm font-semibold text-binance-black shadow-sm transition-all hover:bg-binance-yellow-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-page disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creation.status === 'submitting'
                ? 'Submitting…'
                : creation.status === 'pending'
                  ? 'Waiting for confirmation…'
                  : creation.status === 'failed'
                    ? 'Retry proposal creation'
                    : 'Create proposal'}
            </button>
          )}

          {formError && (
            <p role="alert" className="rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
              {formError}
            </p>
          )}

          <CreationResultPanel creation={creation} />
        </div>
      )}
    </section>
  )
}

function CreationResultPanel({
  creation,
}: {
  creation: ReturnType<Application['readProposalCreationState']>
}) {
  if (creation.status === 'confirmed') {
    const { proposal } = creation
    return (
      <div role="status" className="rounded-lg border border-status-success/30 bg-status-success/10 p-4">
        <p className="text-sm font-semibold text-status-success">
          Proposal #{proposal.id.toString()} created
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Amount
            </dt>
            <dd className="mt-0.5 text-text-primary">
              {creation.formattedAmount} {creation.symbol}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Voting deadline
            </dt>
            <dd className="mt-0.5 text-text-primary">
              {new Date(Number(proposal.votingDeadline) * 1000).toLocaleString()}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Creator &amp; payout recipient
            </dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-text-primary">
              {proposal.creator}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Treasury
            </dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-text-primary">
              {proposal.treasury}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Document reference (immutable)
            </dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-text-primary">
              {proposal.documentReference}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Transaction
            </dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-text-primary">{creation.hash}</dd>
          </div>
        </dl>
      </div>
    )
  }

  if (creation.status === 'failed' || creation.status === 'rejected') {
    return (
      <div role="alert" className="rounded-lg border border-status-error/30 bg-status-error/10 p-4">
        <p className="text-sm font-semibold text-status-error">
          {creation.status === 'rejected' ? 'Transaction rejected' : 'Proposal was not created'}
        </p>
        <p className="mt-1 text-sm text-text-secondary">{creation.message}</p>
        <p className="mt-2 break-all font-mono text-xs text-text-secondary">
          Document only: {creation.documentReference}
        </p>
      </div>
    )
  }

  if (creation.status === 'submitting' || creation.status === 'pending') {
    return (
      <p role="status" className="rounded-lg border border-card-border bg-page/50 p-4 text-sm text-text-secondary">
        {creation.status === 'submitting'
          ? 'Preparing the proposal transaction…'
          : `Transaction submitted: ${creation.hash}. Waiting for confirmation…`}
      </p>
    )
  }

  return null
}
