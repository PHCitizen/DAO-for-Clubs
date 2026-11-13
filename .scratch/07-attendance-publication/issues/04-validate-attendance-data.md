# 04: Retrieve and validate the attendance set

**ID:** 07.04
**Spec:** [Feature 07: Immutable attendance publication](../spec.md)
**What to build:** A reader retrieves published attendance data, validates it against the authenticated event root, and can reconstruct canonical membership paths without contacting the organizer.
**Blocked by:** [07.03 — Finalize the attendance root and reference on-chain](03-finalize-attendance.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Obtain the attendance root and IPFS reference from the configured DAO/chain for the intended proposal, not from an arbitrary file as its own authority.
- [ ] Retrieve and validate the versioned dataset, deployment/event metadata, content-addressed content, and deterministic recomputed root before treating it as authentic.
- [ ] Reconstruct membership paths using the actual canonical construction and vectors established by TODO-01; expose the small shared read/reconstruction interface needed by private and public proving.
- [ ] Distinguish unfinalized events, unavailable content, invalid schema/version, event mismatch, root mismatch, and RPC/gateway errors without accepting partial or unverified data.
- [ ] Public retrieval requires no wallet and no backend. Do not add attendee identity fields or imply public entries identify people.
- [ ] Tests cover genuine finalized data, tampered entries/metadata, malicious gateway substitution, unsupported versions, unavailable services, and canonical path reconstruction against the real root.

## Scope

No proof generation or cryptographic verification substitute is introduced. This supplies validated public data and canonical paths for private ZK and public secret/path hash claims. Active TODO-01's shared-format gate is inherited; no Solidity ZK verifier is required.
