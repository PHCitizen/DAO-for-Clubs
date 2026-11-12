# 02: Pin the prepared attendance set

**ID:** 07.02
**Spec:** [Feature 07: Immutable attendance publication](../spec.md)
**What to build:** The organizer pins the exact prepared attendance dataset to IPFS using their own credentials and receives a reference ready for finalization.
**Blocked by:** [07.01 — Prepare and preview a canonical attendance set](01-prepare-attendance-set.md); [03.02 — Pin the reviewed proposal document to IPFS](../../03-event-proposals/issues/02-pin-proposal-document.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Reuse the established IPFS transport while preserving the separate canonical attendance schema, dataset, and prepared root.
- [ ] Upload exactly the reviewed attendance bytes and associate the returned reference with that immutable prepared dataset/root, not mutable live scans.
- [ ] Obtain pinning credentials from the organizer; do not persist them in scan data, publish them, log them, or embed a shared service secret in the application.
- [ ] Explain upload progress and failure; allow retry without falsely reporting an on-chain attendance attestation.
- [ ] If scans or prepared data change, require a matching fresh publication instead of silently pairing a stale reference with a new root.
- [ ] Tests cover exact bytes, credential privacy, transport failure/retry, invalid upload responses, and input changes during preparation/pinning using the real dataset encoder and controlled external transport.

## Scope

A successful pin is not finalization. No backend, permanent-availability guarantee, correction mechanism, or second IPFS abstraction is introduced. Canonical format work inherits the deferred TODO-01 gate.
