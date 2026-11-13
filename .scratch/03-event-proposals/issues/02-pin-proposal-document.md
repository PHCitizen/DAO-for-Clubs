# 02: Pin the reviewed proposal document to IPFS

**ID:** 03.02
**Spec:** [Feature 03: Proposal authoring and IPFS publication](../spec.md)
**What to build:** A proposer supplies their own IPFS pinning credentials, uploads the exact reviewed document, and receives a content-addressed reference ready for proposal creation.
**Blocked by:** [03.01 — Write and safely preview a Markdown proposal](01-markdown-editor-preview.md).
**Status:** done

## Acceptance criteria

- [x] Pin the exact versioned, encoded proposal document from the reviewed draft using proposer-provided credentials and a documented supported IPFS interaction.
- [x] Show preparation, uploading, successful pinning, and retryable upload failure as distinct states. Pinning does not allocate a proposal ID or claim on-chain creation.
- [x] Bind the returned reference to the prepared document; editing content invalidates its prepared-publication state until the changed document is pinned.
- [x] Establish a small reusable IPFS transport interface supporting controlled failure/retrieval tests and later attendance publication without coupling proposal documents to attendance cryptography.
- [x] Exclude credentials from public content, chain data, logs, committed configuration, and frontend bundles; do not add a shared embedded service secret or application backend.
- [x] Tests cover exact uploaded bytes, mismatched/invalid upload results, service failure and retry, and a draft edit during or after upload. Mock only external transport, not document binding.

## Scope

This produces a pinned document reference, not an on-chain proposal. Proposal publication does not depend on the deferred transparent-ZK investigation.

## Comments

### Implementation — 2026-11-13

**New files:**
- `packages/frontend/src/ipfs.ts` — Reusable, content-agnostic `IpfsTransport` (`pin`/`retrieve`) with `IpfsUploadRequest`/`IpfsUploadReceipt` and typed `IpfsTransportError`. Nothing here knows about proposal schemas or attendance cryptography, so attendance publication can reuse it.
  - Documented supported interaction: Pinata `POST https://api.pinata.cloud/pinning/pinFileToIPFS` (multipart `file` part, `Authorization: Bearer <proposer JWT>`), and retrieval via `GET https://ipfs.io/ipfs/<cid>`. API/gateway URLs and `fetch` are injectable for controlled tests.
  - CID helpers accept CIDv0 (`Qm…`) and CIDv1 base32 (`bafy…`), and format/parse the `ipfs://<cid>` reference used for later proposal creation.
- `packages/frontend/src/ipfs.test.ts` — 14 tests covering the application pinning workflow and the fetch-level transport.

**Extended files:**
- `packages/frontend/src/application.ts`
  - `createApplication(..., { ipfs })` accepts the transport; without it pinning reports `ipfs-unavailable`.
  - `pinProposalDraft({ token })` encodes the current draft once and uploads exactly those bytes as `proposal-document.json` (`application/json`), validates the returned CID and optional reported size, then stores `{ document, bytes, cid, reference }`. Only that record is kept — never the token.
  - `readProposalPinState()` exposes `not-pinned`, `uploading`, `pinned`, `draft-changed`, and retryable `upload-failed`. Results additionally distinguish `invalid-draft`, `credentials-required`, `busy`, `invalid-upload-result`, and `draft-changed-during-upload`.
  - Binding rule: the reference is bound to the uploaded bytes. Any later edit makes the state `draft-changed` with the previous reference; an edit during upload leaves the pin describing only the older bytes and requires re-pinning. A failed/invalid upload never produces a pinned reference, and pinning allocates no proposal ID.
- `packages/frontend/src/applicationInstance.ts` — Wires the credential-free Pinata transport; tokens are supplied per upload from the form.
- `packages/frontend/src/routes/proposals/new.tsx` — Pinning panel with proposer JWT input (password field, not persisted), preparation guidance, uploading spinner, pinned reference with CID/byte size and a public-gateway verification link, stale-draft warning, and retryable failure messaging.

**Notes:**
- Only external transport is mocked in tests. Document encoding, byte binding, and state transitions use the real application code.
- Test coverage: exact uploaded bytes/name/MIME type, wallet-free pinning with no proposal ID, uploading vs pinned states, service failure and retry, empty/malformed CID and size-mismatch results, missing credentials and incomplete drafts, unconfigured transport, edits after and during upload, credential non-retention, Pinata request shape (URL, Authorization header, multipart file bytes), service/malformed responses, gateway retrieval and failures, and CID/reference validation.
