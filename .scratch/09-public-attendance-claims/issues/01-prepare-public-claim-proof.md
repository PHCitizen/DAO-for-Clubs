# 01: Prepare a public-claim secret and membership witness

**ID:** 09.01
**Spec:** [Feature 09: Opt-in public attendance claims](../spec.md)
**What to build:** A credential holder explicitly consents to disclosing the secret and Merkle path for a permanent public wallet-event association, then prepares the membership witness locally. No ZK proof is required for public claiming.
**Blocked by:** [07.04 — Retrieve and validate the attendance set](../../07-attendance-publication/issues/04-validate-attendance-data.md).
**Status:** implemented (POC fixture; TODO-01 canonical-format and 07 publication gates remain)

## Acceptance criteria

- [ ] Reuse supported versioned credential recovery and validated membership reconstruction under the canonical credential/Merkle format approved through TODO-01. Verify locally that the recovered secret derives the published entry and its path yields the finalized root.
- [ ] Display the intended wallet/event/deployment and require explicit consent explaining permanence, public secret/path disclosure, observers' ability to generate private proofs, and first-claim front-running. These accepted risks must not be described as prevented by wallet binding.
- [ ] Prepare the secret and canonical path for ordinary on-chain hash/membership verification. The consumed-entry key is derived by the contract from the validated entry, never a caller-chosen nullifier or recipient-dependent identifier.
- [ ] Apply reviewed event/deployment and credential-version semantics. Do not allow a format change to create another claim for a consumed entry.
- [ ] Prepare locally with honest progress/failure. Secret/path belong only in the explicit claim payload; exclude them from logs, telemetry, and redundant persistence. Never include the recovery signature in public payloads.
- [ ] Discard or regenerate prepared claims after changes to wallet, event, or deployment. This preparation alone is not a recorded on-chain claim.
- [ ] Canonical hash/vector tests cover valid preparation, wrong secret/root/path, malformed encoding, unsupported credential versions, and event/deployment separation. Application action/read tests cover disclosure consent, wallet switching, and failure feedback.

## Scope

Public hash-membership checks and private ZK share canonical credential/Merkle semantics, not a Solidity ZK verifier. This does not wait for the private-proof UI; it remains gated on the shared format agreement from the now-authorized TODO-01 investigation. Preserve the existing ticket filename for inbound links.

## Comments

2026-11-13: Reconciled with the user-approved public secret/path disclosure design. Credential copying and first-claim front-running are accepted weaknesses; duplicate public claims after consumption remain forbidden.

### Implementation — 2026-11-13
- `attendanceMerkle.ts` (sorted-pair keccak256 Merkle, mirrored by the contract) and `attendance.ts::deriveAttendancePublicClaimWitness` recover secret/entry from the v1 credential signature; the recovery signature is never included in any payload.
- `attendanceClaims.ts::preparePublicAttendanceClaim` checks the finalized root, consumption state, and locally rebuilt path before reporting `ready`, with distinct `not-finalized`, `not-a-member`, and `already-consumed` outcomes.
- `application.ts::preparePublicClaim` requires explicit disclosure consent, shows the claiming account, signs only the frozen attendance message, and keeps secret/proof in memory only; submission re-checks account/chain and discards stale preparations (`stale-account`).
- `/attendance` presents permanence, public secret/path disclosure, observer private proofs, and front-running as accepted risks before consent, and displays the target wallet/event.
- Fixture limitation: published entries come from the organizer's local collection, not the unbuilt 07 IPFS publication pipeline, and the Merkle/credential format is a disclosed POC convention rather than the TODO-01-approved canonical format.
