# Feature 06: Recoverable attendance credentials and local scanning

Status: ready-for-agent

## Problem Statement

Attendees need a private attendance credential they can recover without exposing a wallet private key. Organizers need a simple QR check-in process that does not require an on-chain transaction for every attendee or collect a public identity list.

## Solution

Derive an event-specific secret from a reproducible signature made by a supported wallet, display only the hashed attendance entry in a deployment-scoped QR code, and let the organizer collect deduplicated entries in browser localStorage.

## User Stories

1. As an attendee, I want to generate a credential for an event, so that the organizer can attest my attendance.
2. As an attendee, I want to use an ordinary wallet signature rather than expose my private key, so that attendance setup does not require unsafe wallet access.
3. As an attendee, I want to recover the same credential by signing again, so that losing local secret data does not necessarily lose my attendance evidence.
4. As an attendee, I want the supported-wallet limitation explained, so that I do not assume all signing methods reproduce signatures.
5. As an attendee, I want my signing message to identify the event and deployment, so that credentials from different events do not collide.
6. As an attendee, I want a QR containing only a hashed entry and event identifiers, so that scanning does not reveal my secret or wallet signature.
7. As an attendee without voting NFTs, I want to check in, so that attendance is not limited to officers.
8. As an organizer, I want to scan an attendee's QR, so that I can add their entry without a blockchain transaction.
9. As an organizer, I want wrong-event and wrong-deployment QR codes rejected, so that my attendance set contains the intended event's entries.
10. As an organizer, I want duplicate scans identified, so that repeated presentation does not create extra entries.
11. As an organizer, I want accepted scans retained across reloads, so that I can continue collecting in the same browser.
12. As an organizer, I want separate local attendance sets for separate events, so that changing events does not mix scans.
13. As an organizer, I want camera permission failures explained, so that I can retry scanning without corrupting collected entries.
14. As an organizer, I want the accepted-entry count visible, so that I can see collection progress.
15. As an organizer, I want to collect attendance even when funding failed, so that the attestation reflects an event that occurred rather than a funding result.
16. As an attendee, I want my secret and signature kept out of public outputs and logs, so that observers cannot copy the underlying credential from normal use.

## Implementation Decisions

- The attendee signs the exact versioned message already agreed for attendance recovery: application label, chain ID, canonical DAO address, and proposal ID, in a fixed serialization.
- Derive the attendance secret with SHA-256 over ABI-encoded wallet signature and proposal ID. Derive the QR entry with SHA-256 over ABI-encoded proposal ID and secret.
- Freeze the precise message bytes, address representation, signing method, ABI types, and signature-byte treatment with reproducible vectors before implementation is treated as stable. No raw private-key request is permitted.
- Support only a wallet/signing method actually tested to reproduce signatures. Recovery means reproducing the same signature with that supported account and method; it is not a promise across all wallets or account migrations.
- The QR carries chain ID, DAO address, proposal ID, and the hashed entry. It excludes names, raw secrets, wallet signatures, and attendee wallet addresses.
- Validate QR structure and deployment/event identifiers before collection. Deduplicate exact entries and never count a malformed or mismatched scan as accepted.
- Scope localStorage by deployment and proposal. Store the collected hashed entries, not attendee credentials or identities.
- The proposal creator is the organizer. The POC has no delegated scanner roles, simultaneous-device coordination, or synchronization protocol.
- Assume local data will not be cleared. Do not implement scan-list import/export or backup recovery. Handle ordinary storage errors honestly rather than displaying unsaved scans as durable.
- Attendance collection does not depend on voting status, treasury balance, or payment. Attendees need not hold voting NFTs.
- Credential sharing and dishonest organizer attestations remain accepted limitations. A QR scan alone is not independently proven physical presence.
- Stop offering additions to a finalized event and make clear that additional local scans cannot amend its immutable published attendance set.

## Testing Decisions

- Test credential generation and recovery through the application action/read interface with deterministic signing vectors, plus a documented check with the real supported wallet/signing method.
- Cover account, event, chain, and DAO changes; message-byte stability; and the expected failure to recover with different signing output.
- Test the QR-to-scanner flow using deterministic camera payload fixtures and a small actual camera smoke check. Replace the camera transport, not validation/deduplication logic.
- Test duplicates, malformed payloads, wrong deployment/event, reload recovery, localStorage isolation, and storage failures.
- Assert public QR/local-storage contents exclude secrets, signatures, and identity fields. Do not infer privacy from a visually hidden UI element.
- Reuse foundation and minimal proposal fixtures. No prior attendance implementation exists; avoid introducing a separate application harness.

## Out of Scope

- Universal wallet recovery, direct private-key access, non-transferable identity, anti-sharing controls, or independent physical-presence detection.
- Scan-list import/export, browser-data-loss recovery, synchronization, delegated scanners, or organizer replacement.
- IPFS publication, Merkle commitment selection, proof generation, and proof verification.

## Further Notes

Existing v1 recovery and scanning can proceed without completing active TODO-01; the SHA-256 rules above describe frozen v1 only. A proof-friendly v2 and regenerated QRs are authorized in principle, but require shared-format approval before implementation. Preserve v1 vectors and reject mixed-version finalized sets under the agreed transition policy. Publication owns the canonical Merkle construction. Public claims reveal the secret/path for ordinary hash membership; only private presentations require ZK.
