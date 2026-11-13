# Feature 08: Private off-chain attendance presentations

Status: ready-for-agent
Blocked by: TODO-01 and authenticated attendance publication

## Problem Statement

Attendees need to demonstrate possession of an organizer-attested attendance credential without exposing their wallet or which published attendance entry belongs to them. A proof file alone cannot establish that its alleged root was actually published for the event.

## Solution

Generate a real ZK attendance presentation in the browser and export it as a file. Let a verifier import the file, fetch the authoritative event root from the configured blockchain, and verify the presentation off-chain without contacting the organizer.

## User Stories

1. As an attendee, I want to recover my event credential, so that I can prove attendance after the event.
2. As an attendee, I want to retrieve the published attendance set, so that I can construct my own membership witness.
3. As an attendee, I want to know when my credential is absent, so that I do not mistake failed membership for a valid proof.
4. As an attendee, I want to generate a proof locally, so that my secret need not be sent to an application backend.
5. As an attendee, I want to see proof-generation progress or failure, so that an expensive operation does not appear to be a completed result.
6. As an attendee, I want to download a proof file, so that I can send it to a verifier.
7. As an attendee, I want the proof to hide my wallet and attendance entry, so that the verifier learns attendance without a public identity lookup.
8. As a verifier, I want to import a proof without connecting a wallet, so that verification does not require a transaction or personal account.
9. As a verifier, I want the event and deployment shown, so that I know which attendance claim is being checked.
10. As a verifier, I want the root read from the blockchain, so that the attendee cannot authenticate an invented event root with their own file.
11. As a verifier, I want tampered proofs rejected, so that changing a file cannot create valid attendance evidence.
12. As a verifier, I want unsupported versions and wrong deployments identified, so that ambiguous inputs are not treated as valid.
13. As a verifier, I want chain access failures distinguished from invalid proofs, so that I know when verification could not be completed.
14. As a participant, I want the lack of a trusted setup explicit, so that I understand the cryptographic trust assumptions.
15. As a verifier, I want the transferable-credential limitation explained, so that I do not mistake credential possession for the presenter's personal identity.
16. As a verifier, I want attendance distinguished from funding approval, so that a valid proof is not interpreted as evidence of a passed vote or payout.

## Implementation Decisions

- Require the transparent proof system and canonical cryptographic format validated by TODO-01. No implementation may silently substitute a trusted-setup system or a non-ZK signature check.
- Prove knowledge of the attendance secret whose derived QR entry belongs to the event's finalized attendance root. The secret, signature, selected leaf, membership path, and wallet identity remain private.
- Public statement data must identify the intended deployment, event, and authenticated attendance commitment according to the selected system's reviewed format.
- Private presentations must not expose a stable leaf identifier or the public-claim nullifier. Their privacy properties must be evaluated using the actual selected proof format, not inferred merely from the presence of ZK terminology.
- Local witness preparation uses validated published data and rejects a credential not present in the attested set. Witnesses and secrets must not be included in exported proof files or telemetry.
- Define a versioned proof-file format and use application-trusted verifier artifacts. Do not trust an arbitrary verifier or verification key supplied inside an attendee's file.
- Generation happens in the browser without an application backend. Give honest progress, supported-size limits, and actionable failure feedback based on the feasibility results.
- Verification imports the file, resolves its event in the configured deployment, reads the finalized root from the blockchain, and checks the proof against that authenticated statement.
- An RPC failure or missing finalized root is not a successful verification. Distinguish valid, invalid, unsupported, and unable-to-complete results where relevant to user action.
- This is off-chain verification, not guaranteed disconnected verification. No transaction is required to verify; blockchain access is still needed to authenticate the event reference.
- Credentials and presentations are transferable. No designated-verifier challenge, personal identity binding, or prohibition on file forwarding is promised.

## Testing Decisions

- Use the same application action/read interface for browser generation, file export/import, and verification, backed by real local finalized-root records.
- Run real proof round trips using the selected system and its actual verifier. Fixture proofs may accelerate independent UI tests but cannot replace correctness or security tests.
- Test wrong secret, absent membership, altered proof bytes, changed event/root/deployment, missing finalization, unsupported version, invalid encoding, and untrusted verifier metadata.
- Verify that exported artifacts omit secrets, wallet identity, signatures, leaf selection, paths, and private/public-claim linkage identifiers.
- Test chain and IPFS failures without treating transport errors as proof acceptance. Keep cryptographic negative tests independent of cosmetic UI assertions.
- Reuse attendance-publication vectors and foundation fixtures. No prior ZK implementation exists; measured browser proving and verification constraints come from TODO-01, not assumed targets.

## Out of Scope

- Offline authentication from a self-contained attendee-supplied file, trusted setup ceremonies, server-side proving, or application-operated proof services.
- Personal identity verification, non-transferability, designated-verifier sessions, or proof that the organizer was honest about physical attendance.
- Public on-chain claims, attendance correction, and revocation.

## Further Notes

After the canonical proof interface and artifacts are agreed, generation and verification tickets can proceed in parallel. They share versioned public formats rather than each waiting for the other's UI. TODO-01 is authorized and active; its private browser/off-chain ZK qualification remains a real blocker. No Solidity ZK verifier is required. Public claiming discloses the secret/path, so observers can generate private presentations too; private ZK does not restore secrecy or establish exclusive possession after disclosure.
