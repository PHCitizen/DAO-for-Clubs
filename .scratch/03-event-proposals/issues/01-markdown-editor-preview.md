# 01: Write and safely preview a Markdown proposal

**ID:** 03.01
**Spec:** [Feature 03: Proposal authoring and IPFS publication](../spec.md)
**What to build:** An organizer can compose and revise a Markdown proposal and inspect a safe preview before publishing anything.
**Blocked by:** [01.01 — Scaffold and run the pnpm workspace](../../01-browser-foundation/issues/01-scaffold-pnpm-workspace.md).
**Status:** done

## Acceptance criteria

- [x] Provide a Markdown editing workflow with a preview suitable for explaining an event and funding request.
- [x] Draft changes update the preview and remain editable before publication; authoring requires neither wallet connection nor a blockchain transaction.
- [x] Establish the small versioned proposal-document format and exact encoding consumed by the publication ticket, keeping content separate from pinning credentials and later attendance data.
- [x] Preview rendering safely handles untrusted Markdown: script-bearing content and unsafe URL schemes cannot execute application code. Make this rendering policy reusable by published-document reading.
- [x] Behavioral tests cover meaningful Markdown formatting, draft revisions, malicious HTML, and unsafe links through the editor/preview workflow.
- [x] Do not introduce collaborative editing, post-publication amendments, a full rich-text document system, or an application backend.

## Scope

This ticket ends with a reviewed draft and its defined document representation. IPFS upload and on-chain creation are separate workflows. Persistent draft backup is not required.

## Comments

### Implementation — 2026-11-13

**New files:**
- `packages/frontend/src/proposal.ts` — Proposal-document format and the reusable safe-Markdown rendering policy.
  - Document format v1: `{ version: 1, title, markdown }`, exactly those three public fields. No pinning credentials, signatures, or attendance data.
  - Exact encoding: UTF-8 bytes of `JSON.stringify({ version, title, markdown })` with that fixed key order, exposed as `encodeProposalDocument()` / `proposalDocumentToJson()`. `decodeProposalDocument()` validates UTF-8, JSON, exact field set, supported version, non-empty title, and string markdown, with typed `ProposalDocumentError` reasons for later reader error handling.
  - `renderProposalMarkdown()` uses a dedicated `marked` instance (GFM, soft breaks) with a custom renderer: raw HTML is escaped to inert text, fenced code is escaped without a language class, links keep only `http`/`https`/`mailto` or relative destinations, images keep only `http`/`https` or relative sources, and unsafe destinations are dropped while their text stays readable. URLs with control characters, protocol-relative hosts, or entity-obfuscated schemes (`javascript&colon;…`) are rejected; all dynamic attributes are HTML-escaped, and external links get `target="_blank" rel="noopener noreferrer nofollow"`. Published-document reading reuses this same function.
- `packages/frontend/src/routes/proposals/new.tsx` — `/proposals/new` editor and side-by-side safe preview with title input, Markdown textarea, empty state, and document version/byte-size indicator. No wallet or transaction UI.
- `packages/frontend/src/proposal.test.ts` — 13 behavioral tests through the application draft/preview interface.

**Extended files:**
- `packages/frontend/src/application.ts` — Wallet-free, chain-free in-memory draft state plus `readProposalDraft()`, `updateProposalDraft()`, `onProposalDraftChanged()`, `previewProposalDraft()`, and `encodeProposalDraft()`. The preview returns the versioned document, sanitized HTML, and the exact encoded byte size; publication consumes `encodeProposalDraft()` so any edit changes the bytes that must be pinned.
- `packages/frontend/src/styles.css` — Shared `.proposal-document*` typography for preview and future published-document reading.
- `packages/frontend/src/routes/index.tsx` — Added "Write a proposal" navigation.
- `packages/frontend/src/routeTree.gen.ts` — Regenerated with `/proposals/new`.
- `packages/frontend/package.json` / lockfile — Added `marked` as the Markdown parser; sanitization is our own renderer policy, not a browser-only DOM dependency, so it runs identically in tests and in the published-document reader.

**Notes:**
- Drafts are intentionally in-memory only; no backend, storage, collaboration, or post-publication amendment was added.
- Test coverage: empty wallet-free draft, meaningful formatting (headings, emphasis, lists, blockquote, inline code, links), revisions and field independence, subscriber notification, shared-policy equivalence, script/iframe/SVG/event-handler HTML, HTML in code fences, unsafe and obfuscated link schemes, unsafe images, attribute-breakout attempts, exact canonical JSON bytes, byte changes on revision, non-ASCII UTF-8 round-trip, and decoder rejection of unsupported versions/malformed documents.
