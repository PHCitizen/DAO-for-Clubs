# 01: Prepare and preview a canonical attendance set

**ID:** 07.01
**Spec:** [Feature 07: Immutable attendance publication](../spec.md)
**What to build:** The organizer reviews a canonical attendance dataset and deterministic root derived from collected scans before proceeding to irreversible publication.
**Blocked by:** [06.03 — Resume event scanning from localStorage](../../06-attendance-credentials-and-scanning/issues/03-persist-local-attendance.md); [TODO-01 — Validate transparent attendance proofs](../../../todos/01-transparent-zk-feasibility.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Use the proof-compatible, versioned attendance format and Merkle construction established by TODO-01, including its ordering, duplicate, odd-node, empty-set, size, and path rules. Do not guess a format while the investigation is deferred.
- [ ] Prepare a deduplicated hashed-entry dataset from the selected event's saved scans, with only the metadata needed for reconstruction and event/deployment identification.
- [ ] Show the prepared entry count, root, and explicit warning that finalization is immutable and excludes later additions/corrections.
- [ ] Bind the preview to an exact prepared dataset; changes to collected entries require re-preparation rather than silently retaining an old root for new data.
- [ ] Exclude names, attendee addresses, wallet signatures, secrets, and pinning credentials from the dataset and preview outputs.
- [ ] Tests use canonical vectors from TODO-01 and real collected-entry fixtures to verify reproducibility, supported edge sizes, duplicate treatment, deployment isolation, and stale-preview invalidation.

## Scope

This ends with a prepared publication, not IPFS pinning or on-chain finalization. TODO-01 remains explicitly deferred; ready-for-agent does not override the blocker or authorize mock cryptography.
