# Feature 07: Immutable attendance publication

Status: ready-for-agent
Blocked by: TODO-02 for the approved canonical cryptographic format, not completion of private-proof qualification in TODO-01

Format gate satisfied: TODO-02 is resolved following explicit user approval of `docs/attendance-format-v2-proposal.md`. Feature 07 implementation can proceed subject to its normal ticket dependencies. Private-proof security/performance qualification remains separate.

## Problem Statement

A locally collected attendance set is not independently verifiable until the organizer publishes an authenticated commitment and makes the membership data available. Organizers must understand that public data is public and that finalization cannot be undone.

## Solution

Let the event organizer preview a canonical hashed attendance set, pin it to IPFS using their own credentials, and record its root and IPFS reference exactly once on-chain. Let readers retrieve the data and validate it against the organizer's authenticated root.

## User Stories

1. As an organizer, I want to review my deduplicated attendance set, so that I can check it before irreversible publication.
2. As an organizer, I want a clear finalization warning, so that I understand late attendees and corrections will not be accepted afterward.
3. As an organizer, I want to create the attendance commitment from my local scans, so that publication reflects my collected entries.
4. As an organizer, I want to provide my own pinning credentials, so that the application does not need a shared backend secret.
5. As an organizer, I want to upload only hashed entries and reconstruction metadata, so that I do not publish attendee names or secrets.
6. As an organizer, I want an upload failure to leave finalization available, so that a service problem does not permanently publish unusable data.
7. As an organizer, I want to record the root and IPFS reference together, so that readers can locate data for the authenticated commitment.
8. As an organizer, I want retryable blockchain submission after uploading, so that a rejected wallet request does not lose the prepared publication.
9. As a participant, I want only the proposal creator able to finalize attendance, so that another wallet cannot replace the organizer's attestation.
10. As a participant, I want publication allowed only once, so that an organizer cannot later rewrite the attested set.
11. As an organizer, I want to publish for an unfunded or unsuccessful proposal, so that attendance remains independent of governance.
12. As a reader, I want to see the on-chain root and IPFS reference, so that I can obtain the authoritative event commitment.
13. As a reader, I want downloaded data checked against the root, so that a gateway response cannot silently alter the attendance set.
14. As a reader, I want unavailable or malformed data reported, so that I do not mistake retrieval failure for valid membership evidence.
15. As an attendee, I want sufficient published data to reconstruct a membership path, so that I do not need the organizer online to generate a proof.
16. As a reader, I want attendance distinguished from funding approval, so that an attestation does not imply a successful vote or payout.

## Implementation Decisions

- Publication uses a versioned canonical attendance-set format containing deduplicated hashed entries and only the metadata needed for deterministic Merkle reconstruction.
- TODO-01 must establish the proof-compatible Merkle construction, leaf order, duplicate handling, odd-node behavior, empty-set handling, supported size, and path encoding. Do not finalize a competing format beforehand.
- Preview and pin the exact data whose root will be recorded. The prepared dataset, root, and IPFS reference must not become mismatched through mutable local scans or asynchronous UI changes.
- Reuse the general IPFS transport introduced by proposal publication, while keeping the cryptographic attendance format and immutable event-finalization workflow separate from proposal documents.
- Pin with organizer-provided credentials. Keep credentials out of deployment bundles, chain transactions, attendance files, logs, and committed configuration; do not persist them as part of the scan list.
- Publication is a two-system workflow, not an atomic IPFS/blockchain transaction. Successful pinning alone is not finalization. A rejected or failed chain transaction must remain retryable; orphaned pinned data does not authorize attendance.
- Only the proposal creator may record the root and IPFS reference. Record them together, only once, with no correction, replacement, revocation, or organizer-transfer workflow.
- Finalization has no funding, vote-passing, payment, or scheduled event-end prerequisite. The organizer manually decides when collection is complete.
- Readers authenticate the commitment through the configured chain and DAO, not through an organizer-provided file or URL alone.
- Recompute and compare the root when loading a dataset. Invalid schemas, inconsistent metadata, incorrect roots, wrong deployments, and unavailable content must not be treated as valid attendance data.
- Retrieving attendance data does not require a connected wallet. No backend indexer or secret service is introduced.
- Preserve the public dataset's privacy properties: no names, wallet addresses, signatures, or raw secrets. IPFS content may be copied and retained indefinitely.

## Testing Decisions

- Exercise preview, pinning, on-chain finalization, retrieval, and root validation through the application action/read interface backed by real local contracts.
- Replace only the IPFS transport for deterministic success/failure tests. Use the real canonical encoder, tree construction, and dataset validator, with reproducible vectors from TODO-01.
- Direct contract tests reject another wallet, repeated publication, and attempted changes while allowing publication for proposals with failed votes or no funding.
- Test duplicate scans, supported edge-case tree sizes, schema/root mismatches, content unavailability, pinning failure, rejected submission after successful pinning, and changed local input during preparation.
- Validate that finalization records precisely the previewed root and reference, and that an IPFS response alone never appears as a completed on-chain attestation.
- Reuse proposal, local attendance, and foundation fixtures. There is no existing publication implementation.

## Out of Scope

- Selecting the proof system during this feature, silently changing credential hashes, or using a fake commitment as a production-compatible result.
- Shared pinning accounts, backend storage, guaranteed perpetual IPFS availability, publication corrections, late entries, organizer replacement, or attendance revocation.
- Independently proving physical attendance or requiring funding success before attestation.

## Further Notes

The active investigation is recorded as TODO-01. Canonical tree/publication work requires its approved shared credential/Merkle format, not completion of a Solidity ZK verifier or private-proof UI. Public claims reveal the secret/path and use ordinary hash membership; private proofs alone require ZK. Primitive Poseidon2 vector agreement is evidence, not format approval. Finalized sets must use one immutable credential version and must not silently reinterpret v1 entries or reset public-claim consumption through upgrades.
