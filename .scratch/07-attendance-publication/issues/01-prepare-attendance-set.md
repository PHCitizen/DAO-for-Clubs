# 01: Prepare and preview a canonical attendance set

**ID:** 07.01
**Spec:** [Feature 07: Immutable attendance publication](../spec.md)
**What to build:** The organizer reviews a canonical attendance dataset and deterministic root derived from collected scans before proceeding to irreversible publication.
**Blocked by:** [06.03 — Resume event scanning from localStorage](../../06-attendance-credentials-and-scanning/issues/03-persist-local-attendance.md); [TODO-02 — approved shared credential/Merkle format](../../../../todos/02-attendance-format-agreement.md). Not blocked by completion of TODO-01's private-proof budgets, native↔Chrome interoperability, Firefox, Solidity ZK verification, or private-proof UI.
**Status:** ready-for-agent

**Format gate:** satisfied. The user approved [the exact minimal v2 POC agreement](../../../../docs/attendance-format-v2-proposal.md); TODO-02 is resolved. Only the remaining ordinary dependencies above must be completed before implementation. Do not wait for private-proof qualification in TODO-01.

## Acceptance criteria

- [ ] Use the approved, versioned attendance format and Merkle construction established by active TODO-01, including ordering, duplicates, odd-node/empty-set handling, sizes, and path rules. Match browser/private constraints and ordinary Solidity public-claim hashing. Do not infer format approval from passing primitive vectors.
- [ ] Finalize a single credential version per event; preserve v1 semantics, require regenerated v2 entries under the approved transition rules, and reject mixed-version sets. Bind canonical data to the chain/DAO/event and prevent version transitions from resetting public-claim consumption.
- [ ] Prepare a deduplicated hashed-entry dataset from the selected event's saved scans, with only the metadata needed for reconstruction and event/deployment identification.
- [ ] Show the prepared entry count, root, and explicit warning that finalization is immutable and excludes later additions/corrections.
- [ ] Bind the preview to an exact prepared dataset; changes to collected entries require re-preparation rather than silently retaining an old root for new data.
- [ ] Exclude names, attendee addresses, wallet signatures, secrets, and pinning credentials from the dataset and preview outputs.
- [ ] Tests use canonical vectors from TODO-01 and real collected-entry fixtures to verify reproducibility, supported edge sizes, duplicate treatment, deployment isolation, and stale-preview invalidation.

## Scope

This ends with a prepared publication, not IPFS pinning or on-chain finalization. TODO-01 is active; ready-for-agent does not override its shared-format approval gate or authorize mock cryptography. Public claims reveal the secret/path and use hash membership; no on-chain ZK verifier is needed.
