import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { ProposalPinState } from '../../application'
import { app } from '../../applicationInstance'

export const Route = createFileRoute('/proposals/new')({ component: ProposalEditorPage })

function ProposalEditorPage() {
  const [draft, setDraft] = useState(() => app.readProposalDraft())
  const [pinState, setPinState] = useState<ProposalPinState>(() => app.readProposalPinState())
  const [token, setToken] = useState('')
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  useEffect(() => {
    setDraft(app.readProposalDraft())
    return app.onProposalDraftChanged(setDraft)
  }, [])

  useEffect(() => {
    setPinState(app.readProposalPinState())
    return app.onProposalPinStateChanged(setPinState)
  }, [])

  const preview = app.previewProposalDraft()
  const isEmpty = draft.title.trim().length === 0 && draft.markdown.trim().length === 0
  const uploading = pinState.status === 'uploading'

  async function handlePin() {
    setActionMessage(null)
    const result = await app.pinProposalDraft({ token })
    switch (result.status) {
      case 'pinned':
      case 'upload-failed':
      case 'invalid-upload-result':
        // Rendered from the shared pin state below.
        break
      case 'draft-changed-during-upload':
        setActionMessage(result.message)
        break
      default:
        setActionMessage(result.message)
    }
  }

  return (
    <div className="min-h-screen bg-page text-text-primary">
      <header className="sticky top-0 z-30 border-b border-card-border bg-page/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            DAO for Clubs
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-card-border bg-card px-2.5 py-0.5 text-xs font-medium text-text-secondary">
            Draft only — nothing published
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-binance-yellow">
            Event proposal
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-text-primary sm:text-4xl">
            Write and review your proposal
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary sm:text-base">
            Describe the event and its funding request in Markdown and check the safe preview before
            publishing. Authoring needs no wallet connection and no blockchain transaction.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Editor */}
          <section
            aria-labelledby="proposal-editor-title"
            className="rounded-xl border border-card-border bg-card p-6 shadow-lg shadow-black/30 sm:p-7"
          >
            <div className="flex items-center justify-between gap-3 border-b border-card-border pb-4">
              <h2 id="proposal-editor-title" className="text-base font-semibold text-text-primary sm:text-lg">
                Markdown draft
              </h2>
              <span className="rounded-full border border-card-border bg-page px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                Editable
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="proposal-title"
                  className="block text-xs font-semibold uppercase tracking-wider text-text-secondary"
                >
                  Event title
                </label>
                <input
                  id="proposal-title"
                  type="text"
                  value={draft.title}
                  onChange={(event) => app.updateProposalDraft({ title: event.target.value })}
                  placeholder="Spring club hackathon"
                  className="mt-1.5 block w-full rounded-lg border border-card-border bg-page px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary transition-colors focus:border-binance-yellow focus:outline-none focus:ring-1 focus:ring-binance-yellow"
                />
              </div>

              <div>
                <label
                  htmlFor="proposal-markdown"
                  className="block text-xs font-semibold uppercase tracking-wider text-text-secondary"
                >
                  Event and funding request (Markdown)
                </label>
                <textarea
                  id="proposal-markdown"
                  value={draft.markdown}
                  onChange={(event) => app.updateProposalDraft({ markdown: event.target.value })}
                  placeholder={
                    '## About the event\n\nWhat happens, when, and who it is for.\n\n## Budget\n\n- Venue: 200 TestUSD\n- Food: 150 TestUSD\n\n## Why it matters\n\nExplain the funding request.'
                  }
                  rows={18}
                  spellCheck={false}
                  className="mt-1.5 block w-full resize-y rounded-lg border border-card-border bg-page px-3.5 py-2.5 font-mono text-sm leading-relaxed text-text-primary placeholder:text-text-tertiary transition-colors focus:border-binance-yellow focus:outline-none focus:ring-1 focus:ring-binance-yellow"
                />
              </div>

              <p className="text-xs leading-relaxed text-text-secondary">
                Raw HTML is shown as inert text, and only safe link schemes are kept. IPFS upload and
                on-chain proposal creation are separate steps.
              </p>
            </div>
          </section>

          {/* Preview */}
          <section
            aria-labelledby="proposal-preview-title"
            className="rounded-xl border border-card-border bg-card p-6 shadow-lg shadow-black/30 sm:p-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border pb-4">
              <h2 id="proposal-preview-title" className="text-base font-semibold text-text-primary sm:text-lg">
                Safe preview
              </h2>
              <span className="rounded-full border border-card-border bg-page px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                Document v{preview.document.version} · UTF-8 JSON · {preview.encodedBytes} bytes
              </span>
            </div>

            <div className="mt-5">
              {isEmpty ? (
                <p role="status" className="rounded-lg border border-dashed border-card-border bg-page/50 p-6 text-sm text-text-secondary">
                  Start writing on the left to review your proposal here.
                </p>
              ) : (
                <article className="proposal-document rounded-lg border border-card-border/60 bg-page/50 p-5">
                  <h1 className="proposal-document-title">
                    {draft.title.trim().length > 0 ? draft.title : 'Untitled event proposal'}
                  </h1>
                  {preview.html.length > 0 ? (
                    <div
                      className="proposal-document-body"
                      // Sanitized by the shared renderProposalMarkdown policy:
                      // raw HTML is escaped and unsafe URL schemes are removed.
                      dangerouslySetInnerHTML={{ __html: preview.html }}
                    />
                  ) : (
                    <p className="mt-3 text-sm text-text-secondary">
                      Add Markdown content to see it rendered.
                    </p>
                  )}
                </article>
              )}
            </div>
          </section>
        </div>

        <ProposalPinPanel
          state={pinState}
          token={token}
          uploading={uploading}
          actionMessage={actionMessage}
          onTokenChange={setToken}
          onPin={handlePin}
        />
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pinning panel
// ---------------------------------------------------------------------------

interface ProposalPinPanelProps {
  state: ProposalPinState
  token: string
  uploading: boolean
  actionMessage: string | null
  onTokenChange: (value: string) => void
  onPin: () => void
}

function ProposalPinPanel({
  state,
  token,
  uploading,
  actionMessage,
  onTokenChange,
  onPin,
}: ProposalPinPanelProps) {
  const buttonLabel = uploading
    ? 'Uploading…'
    : state.status === 'upload-failed'
      ? 'Retry upload'
      : state.status === 'draft-changed'
        ? 'Pin updated document'
        : 'Pin reviewed document'

  return (
    <section
      aria-labelledby="proposal-pin-title"
      className="mt-6 rounded-xl border border-card-border bg-card p-6 shadow-lg shadow-black/30 sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border pb-4">
        <h2 id="proposal-pin-title" className="text-base font-semibold text-text-primary sm:text-lg">
          Pin the reviewed document to IPFS
        </h2>
        <span className="rounded-full border border-card-border bg-page px-2.5 py-0.5 text-xs font-medium text-text-secondary">
          No on-chain proposal yet
        </span>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-text-secondary">
        Uploading pins exactly the reviewed UTF-8 JSON document using your own Pinata JWT. Pinning
        returns a content-addressed reference for a later proposal; it does not allocate a proposal
        ID and does not submit a blockchain transaction.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <label
            htmlFor="pinata-token"
            className="block text-xs font-semibold uppercase tracking-wider text-text-secondary"
          >
            Your Pinata JWT
          </label>
          <input
            id="pinata-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => onTokenChange(event.target.value)}
            placeholder="eyJhbGciOi…"
            className="mt-1.5 block w-full rounded-lg border border-card-border bg-page px-3.5 py-2.5 font-mono text-sm text-text-primary placeholder:text-text-tertiary transition-colors focus:border-binance-yellow focus:outline-none focus:ring-1 focus:ring-binance-yellow"
          />
          <p className="mt-1.5 text-xs text-text-secondary">
            Used only for this upload request. Never stored, logged, or included in the document.
          </p>
        </div>
        <button
          type="button"
          onClick={onPin}
          disabled={uploading}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-binance-yellow px-5 py-2.5 text-sm font-semibold text-binance-black shadow-sm transition-all hover:bg-binance-yellow-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-page disabled:cursor-not-allowed disabled:opacity-60 lg:mb-7"
        >
          {buttonLabel}
        </button>
      </div>

      <div className="mt-5">
        <PinStatePanel state={state} />
        {actionMessage && (
          <p role="alert" className="mt-3 rounded-lg border border-binance-yellow/30 bg-binance-yellow/10 p-3 text-sm text-binance-yellow">
            {actionMessage}
          </p>
        )}
      </div>
    </section>
  )
}

function PinStatePanel({ state }: { state: ProposalPinState }) {
  if (state.status === 'uploading') {
    return (
      <p role="status" className="flex items-center gap-2.5 rounded-lg border border-card-border bg-page/50 p-4 text-sm text-text-secondary">
        <svg className="h-4 w-4 animate-spin text-binance-yellow" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Uploading the reviewed document to IPFS…
      </p>
    )
  }

  if (state.status === 'pinned') {
    return (
      <div role="status" className="rounded-lg border border-status-success/30 bg-status-success/10 p-4">
        <p className="text-sm font-semibold text-status-success">Document pinned</p>
        <p className="mt-1 text-sm text-text-secondary">
          The reference below describes exactly the reviewed document. No proposal has been created
          on-chain.
        </p>
        <p className="mt-3 break-all rounded-lg border border-status-success/20 bg-page/60 p-2.5 font-mono text-xs text-text-primary">
          {state.pin.reference}
        </p>
        <p className="mt-2 text-xs text-text-secondary">
          CID {state.pin.cid} · {state.pin.bytes.byteLength} bytes ·{' '}
          <a
            href={`https://ipfs.io/ipfs/${state.pin.cid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-binance-yellow underline underline-offset-2 hover:text-binance-yellow-hover"
          >
            Verify on a public gateway
          </a>
        </p>
      </div>
    )
  }

  if (state.status === 'draft-changed') {
    return (
      <div role="alert" className="rounded-lg border border-binance-yellow/30 bg-binance-yellow/10 p-4">
        <p className="text-sm font-semibold text-binance-yellow">Draft changed since pinning</p>
        <p className="mt-1 text-sm text-text-secondary">
          The previous reference no longer matches this draft. Pin the updated document before using
          a reference for proposal creation.
        </p>
        <p className="mt-2 break-all font-mono text-xs text-text-secondary">
          Previous reference: {state.previousReference}
        </p>
      </div>
    )
  }

  if (state.status === 'upload-failed') {
    return (
      <div role="alert" className="rounded-lg border border-status-error/30 bg-status-error/10 p-4">
        <p className="text-sm font-semibold text-status-error">Upload failed — retry available</p>
        <p className="mt-1 text-sm text-text-secondary">{state.message}</p>
        <p className="mt-2 text-xs text-text-secondary">
          Nothing was pinned for this draft and no proposal was created.
        </p>
      </div>
    )
  }

  return (
    <p role="status" className="rounded-lg border border-dashed border-card-border bg-page/50 p-4 text-sm text-text-secondary">
      Not pinned yet. Review the preview above, then pin the document to get its IPFS reference.
    </p>
  )
}
