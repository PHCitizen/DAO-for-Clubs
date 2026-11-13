# 02: Submit and enforce a unique public claim

**ID:** 09.02
**Spec:** [Feature 09: Opt-in public attendance claims](../spec.md)
**What to build:** A claimant submits a secret and Merkle path for ordinary on-chain hash verification, creating one permanent sender-event association per validated entry while deliberately exposing the transferable credential.
**Blocked by:** [09.01 — Prepare a public-claim secret and membership witness](01-prepare-public-claim-proof.md).
**Status:** implemented (POC fixture; cost-ceiling and canonical-format approvals remain)

## Acceptance criteria

- [ ] Derive the entry from the submitted secret using the approved versioned credential format and verify the canonical Merkle path against the intended event's finalized root on the supported chain. Reject malformed encodings and unsupported versions; no ZK verifier is required.
- [ ] Record the association for the transaction sender. Explicitly accept that another sender can copy an unconsumed secret/path and claim first; do not represent this as a wallet-bound proof.
- [ ] Atomically consume the derived entry in event/deployment scope only for a valid recorded claim. Reject reuse even from a different wallet; invalid submissions must not reserve it. Do not accept arbitrary caller-selected consumption keys.
- [ ] Record a permanent inspectable wallet-event association and expose public reads/events for subsequent browsing. Attendance requires neither passed voting nor payment.
- [ ] Calldata intentionally contains the secret and membership path, never the recovery signature. Events support inspection without redundant secret disclosure. Warn that observers can reuse the revealed credential for private proofs and front-run its first public claim.
- [ ] Show submitted versus confirmed claim accurately, with wallet rejection, verification failure, duplicate-claim, and stale-account feedback.
- [ ] Real hash/membership contract tests and application action/read tests cover correct claiming, wrong secret/path/root/event, malformed input, deployment separation, duplicate use across wallets, and invalid-claim non-consumption. Demonstrate copied-witness first-claim success followed by rejection of the original sender as a duplicate.
- [ ] Verify public claiming does not revoke private presentations. Once private ZK is available, demonstrate that an observer who copied the disclosed secret can generate a valid private presentation too.
- [ ] Measure ordinary hash-verification gas, calldata, and contract size against real BSC constraints; obtain approval of the concrete cost ceiling before acceptance. No format/version transition may silently reset entry consumption.

## Scope

No claim deletion, transfer, revocation, gasless relayer, Solidity ZK verifier, or front-running protection. Inherits TODO-01's canonical format gate, not the removed direct-EVM ZK pipeline requirement. Fixtures alone cannot satisfy real on-chain hash/membership acceptance.

## Comments

2026-11-13: Reconciled with the user-approved public secret/path disclosure design and entry-based single-claim enforcement.

### Implementation — 2026-11-13
- `AttendanceClaims.sol` derives `entry = sha256(abi.encode(proposalId, secret))`, verifies the sorted-pair keccak256 path against the finalized root, records the association for `msg.sender` via `PublicAttendanceClaimed(proposalId, claimant, entry)`, and sets `entryConsumed[proposalId][entry]` only for a valid claim. Invalid proofs, unfinalized roots, and duplicates revert without consuming anything; consumption is keyed by the derived entry, never a caller-chosen nullifier. No ZK verifier is used and events omit the secret and recovery signature.
- `finalizeAttendanceRoot` is a one-time organizer-only fixture standing in for 07's publication pipeline; attendance requires neither passing nor payment.
- `attendanceClaims.ts::submitPublicAttendanceClaim` separates submission, revert, and confirmation failure and requires a matching claim event; `application.ts::submitPublicClaim` maps wallet rejection, verification failure/duplicate, and stale-account outcomes and never reports a failed claim as confirmed.
- Copied-witness first-claim success followed by duplicate rejection is covered by `packages/contracts/test/public-attendance-claims.test.ts`; front-running is documented as accepted, not prevented.
- Not completed: BSC gas/calldata/size cost-ceiling approval, TODO-01 canonical-format approval, and a private-ZK observer-presentation demonstration (feature 08 is unbuilt).
