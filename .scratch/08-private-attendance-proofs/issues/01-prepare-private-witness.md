# 01: Prepare a private attendance witness

**ID:** 08.01
**Spec:** [Feature 08: Private off-chain attendance presentations](../spec.md)
**What to build:** An attendee recovers their credential and privately checks that it belongs to the event's authenticated attendance set, preparing the witness needed for a private proof.
**Blocked by:** [07.04 — Retrieve and validate the attendance set](../../07-attendance-publication/issues/04-validate-attendance-data.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Reuse the agreed supported-wallet recovery and validated dataset/path interfaces rather than creating a second secret derivation or Merkle format.
- [ ] Locate the derived QR entry in the authenticated event set and prepare the selected system's actual private membership witness locally.
- [ ] Distinguish credential absent, unfinalized event, data retrieval/validation failure, signing rejection, and witness-ready state.
- [ ] Account, event, chain, or DAO changes cannot leave a stale witness presented as ready for a different credential or event.
- [ ] Secrets, signatures, selected entry, and paths are not exported, transmitted to a backend, logged, or included in public UI/debug output. A local ready indicator is not represented as a completed ZK proof.
- [ ] Tests use canonical real datasets/vectors for present/absent membership, wrong secret, event separation, recovery, and invalidated preparation.

## Scope

This ends with local proof readiness, not a downloadable proof or on-chain claim. Credentials remain transferable. Construction and supported sizes inherit active TODO-01's shared-format gate. Public claims disclose reusable credentials; observers can prepare private witnesses too. No Solidity ZK verifier is required.
