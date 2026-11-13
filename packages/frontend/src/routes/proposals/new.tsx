import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { app } from '../../applicationInstance'

export const Route = createFileRoute('/proposals/new')({ component: ProposalEditorPage })

function ProposalEditorPage() {
  const [draft, setDraft] = useState(() => app.readProposalDraft())

  useEffect(() => {
    setDraft(app.readProposalDraft())
    return app.onProposalDraftChanged(setDraft)
  }, [])

  const preview = app.previewProposalDraft()
  const isEmpty = draft.title.trim().length === 0 && draft.markdown.trim().length === 0

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
      </main>
    </div>
  )
}
