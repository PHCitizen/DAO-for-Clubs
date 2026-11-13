import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { PublicAttendanceClaim } from '../attendanceClaims'
import { app } from '../applicationInstance'
import { useWalletState } from '../walletState'

export const Route = createFileRoute('/attendance')({ component: AttendanceClaimsPage })

const inputClass =
  'mt-1.5 block w-full rounded-lg border border-card-border bg-page px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-binance-yellow focus:outline-none focus:ring-1 focus:ring-binance-yellow'
const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-text-secondary'
const buttonClass =
  'rounded-lg bg-binance-yellow px-4 py-2 text-sm font-semibold text-binance-black transition-all hover:bg-binance-yellow-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow disabled:cursor-not-allowed disabled:opacity-60'
const cardClass = 'rounded-xl border border-card-border bg-card p-6 shadow-lg shadow-black/30 sm:p-7'

function AttendanceClaimsPage() {
  const wallet = useWalletState()
  const [proposalId, setProposalId] = useState('1')
  const [consent, setConsent] = useState(false)
  const [claimState, setClaimState] = useState(app.readPublicClaimState())
  const [message, setMessage] = useState<string | null>(null)
  const [rootMessage, setRootMessage] = useState<string | null>(null)

  const [eventClaims, setEventClaims] = useState<PublicAttendanceClaim[]>([])
  const [eventReadMessage, setEventReadMessage] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState('')
  const [walletClaims, setWalletClaims] = useState<PublicAttendanceClaim[]>([])
  const [walletReadMessage, setWalletReadMessage] = useState<string | null>(null)

  useEffect(() => app.onPublicClaimStateChanged(setClaimState), [])

  const numericProposalId = BigInt(proposalId || '0')
  const localEntryCount = app.readAttendanceEntries(numericProposalId).length

  async function handleFinalize() {
    setRootMessage(null)
    const result = await app.finalizeAttendanceRootForProposal({ proposalId: numericProposalId })
    setRootMessage(
      result.status === 'confirmed'
        ? `Attendance root finalized. Transaction: ${result.hash}`
        : result.message
    )
  }

  async function handlePrepare() {
    setMessage(null)
    const result = await app.preparePublicClaim({ proposalId: numericProposalId, consent })
    if (result.status !== 'ready') setMessage(result.message)
  }

  async function handleSubmit() {
    setMessage(null)
    const result = await app.submitPublicClaim()
    setMessage(
      result.status === 'confirmed'
        ? `Public claim confirmed. Transaction: ${result.hash}`
        : result.message
    )
    if (result.status === 'confirmed') await loadEventClaims()
  }

  async function loadEventClaims() {
    const result = await app.readPublicClaimsByEvent(numericProposalId)
    if (result.status === 'success') {
      setEventClaims(result.claims)
      setEventReadMessage(result.claims.length === 0 ? 'No public claims for this event yet.' : null)
    } else {
      setEventClaims([])
      setEventReadMessage(result.message)
    }
  }

  async function loadWalletClaims() {
    const result = await app.readPublicClaimsByWallet(walletAddress)
    if (result.status === 'success') {
      setWalletClaims(result.claims)
      setWalletReadMessage(result.claims.length === 0 ? 'No public claims for this wallet.' : null)
    } else {
      setWalletClaims([])
      setWalletReadMessage(result.message)
    }
  }

  return (
    <div className="min-h-screen bg-page text-text-primary">
      <header className="border-b border-card-border bg-page/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link to="/" className="text-sm font-medium text-text-secondary hover:text-text-primary">
            ← DAO for Clubs
          </Link>
          <span className="rounded-full border border-card-border bg-card px-2.5 py-0.5 text-xs text-text-secondary">
            Opt-in public attendance
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Public attendance claims</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-secondary">
            A public claim is a voluntary, permanent wallet–event association based on a transferable
            organizer-attested credential. It is not non-transferable identity, independent proof of
            physical presence, or evidence of voting, payment, or funding. Claim calldata permanently
            reveals the credential secret and Merkle path: observers can generate private proofs and
            can front-run the first claim, so a recorded wallet does not establish exclusive or
            original possession. Private off-chain presentations are not revoked by claiming.
          </p>
        </div>

        {/* Organizer finalization */}
        <section aria-labelledby="finalize-title" className={cardClass}>
          <h2 id="finalize-title" className="text-lg font-semibold">
            Organizer: finalize the attendance root
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Uses the attendance entries collected on this device. The proposal creator signs one
            finalization transaction per event.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-40">
              <label htmlFor="finalize-proposal" className={labelClass}>
                Proposal ID
              </label>
              <input
                id="finalize-proposal"
                className={inputClass}
                value={proposalId}
                onChange={(event) => setProposalId(event.target.value)}
              />
            </div>
            <p className="text-sm text-text-secondary">{localEntryCount} collected entries</p>
            <button type="button" className={buttonClass} onClick={() => void handleFinalize()}>
              Finalize root
            </button>
          </div>
          {rootMessage && <p className="mt-3 break-all text-sm text-text-secondary">{rootMessage}</p>}
        </section>

        {/* Claim */}
        <section aria-labelledby="claim-title" className={cardClass}>
          <h2 id="claim-title" className="text-lg font-semibold">
            Make a public claim
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Claiming wallet:{' '}
            <span className="font-mono text-xs text-text-primary">
              {wallet.status === 'connected' ? wallet.account : 'not connected'}
            </span>
          </p>
          <label className="mt-4 flex items-start gap-3 rounded-lg border border-binance-yellow/30 bg-binance-yellow/10 p-4 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1"
            />
            <span>
              I understand this is permanent and irreversible: my credential secret and Merkle path
              become public calldata, observers can reuse them for private proofs, and a mempool
              observer may front-run the first claim for a different wallet. Only one public claim is
              allowed per credential.
            </span>
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className={buttonClass}
              disabled={!consent || claimState.status === 'preparing'}
              onClick={() => void handlePrepare()}
            >
              {claimState.status === 'preparing' ? 'Preparing…' : 'Prepare claim'}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={claimState.status !== 'ready'}
              onClick={() => void handleSubmit()}
            >
              {claimState.status === 'submitting' ? 'Submitting…' : 'Submit public claim'}
            </button>
          </div>
          {claimState.status === 'ready' && (
            <p className="mt-3 break-all font-mono text-xs text-text-secondary">
              Prepared for proposal {claimState.proposalId.toString()} · entry {claimState.entry} ·
              root {claimState.root}
            </p>
          )}
          {claimState.status === 'confirmed' && (
            <p role="status" className="mt-3 text-sm text-status-success">
              Claim confirmed: {claimState.hash}
            </p>
          )}
          {message && <p className="mt-3 break-all text-sm text-text-secondary">{message}</p>}
        </section>

        {/* Browse by event */}
        <section aria-labelledby="event-claims-title" className={cardClass}>
          <h2 id="event-claims-title" className="text-lg font-semibold">
            Claims by event
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Confirmed on-chain associations only. Pending or failed transactions are never listed,
            and raw secrets/paths are not displayed.
          </p>
          <button type="button" className={`${buttonClass} mt-4`} onClick={() => void loadEventClaims()}>
            Load event claims
          </button>
          <ClaimList claims={eventClaims} emptyMessage={eventReadMessage} />
        </section>

        {/* Browse by wallet */}
        <section aria-labelledby="wallet-claims-title" className={cardClass}>
          <h2 id="wallet-claims-title" className="text-lg font-semibold">
            Claims by wallet
          </h2>
          <label htmlFor="wallet-lookup" className={labelClass}>
            Wallet address
          </label>
          <input
            id="wallet-lookup"
            className={inputClass}
            placeholder="0x…"
            value={walletAddress}
            onChange={(event) => setWalletAddress(event.target.value)}
          />
          <button type="button" className={`${buttonClass} mt-3`} onClick={() => void loadWalletClaims()}>
            Load wallet claims
          </button>
          <ClaimList claims={walletClaims} emptyMessage={walletReadMessage} />
        </section>
      </main>
    </div>
  )
}

function ClaimList({
  claims,
  emptyMessage,
}: {
  claims: PublicAttendanceClaim[]
  emptyMessage: string | null
}) {
  if (claims.length === 0) {
    return emptyMessage ? <p className="mt-3 text-sm text-text-secondary">{emptyMessage}</p> : null
  }
  return (
    <ul className="mt-4 space-y-2">
      {claims.map((claim) => (
        <li
          key={`${claim.proposalId}:${claim.claimant}:${claim.entry}`}
          className="rounded-lg border border-card-border/60 bg-page/50 p-3 text-xs"
        >
          <p className="break-all font-mono text-text-primary">Wallet: {claim.claimant}</p>
          <p className="mt-1 text-text-secondary">
            Proposal #{claim.proposalId.toString()} · entry {claim.entry}
          </p>
        </li>
      ))}
    </ul>
  )
}
