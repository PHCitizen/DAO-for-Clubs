# 02: Pin the reviewed proposal document to IPFS

**ID:** 03.02
**Spec:** [Feature 03: Proposal authoring and IPFS publication](../spec.md)
**What to build:** A proposer supplies their own IPFS pinning credentials, uploads the exact reviewed document, and receives a content-addressed reference ready for proposal creation.
**Blocked by:** [03.01 — Write and safely preview a Markdown proposal](01-markdown-editor-preview.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Pin the exact versioned, encoded proposal document from the reviewed draft using proposer-provided credentials and a documented supported IPFS interaction.
- [ ] Show preparation, uploading, successful pinning, and retryable upload failure as distinct states. Pinning does not allocate a proposal ID or claim on-chain creation.
- [ ] Bind the returned reference to the prepared document; editing content invalidates its prepared-publication state until the changed document is pinned.
- [ ] Establish a small reusable IPFS transport interface supporting controlled failure/retrieval tests and later attendance publication without coupling proposal documents to attendance cryptography.
- [ ] Exclude credentials from public content, chain data, logs, committed configuration, and frontend bundles; do not add a shared embedded service secret or application backend.
- [ ] Tests cover exact uploaded bytes, mismatched/invalid upload results, service failure and retry, and a draft edit during or after upload. Mock only external transport, not document binding.

## Scope

This produces a pinned document reference, not an on-chain proposal. Proposal publication does not depend on the deferred transparent-ZK investigation.
