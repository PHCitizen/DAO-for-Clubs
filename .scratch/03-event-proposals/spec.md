# Feature 03: Proposal authoring and IPFS publication

Status: ready-for-agent

## Problem Statement

A funding amount and voting deadline do not explain an event. Organizers need to describe their plans, and members need a readable, trustworthy proposal document before deciding whether to support the request. Proposal authoring and publication must not be hidden inside the separate voting feature.

## Solution

Provide a Markdown editor with a safe preview, publish the proposal document to IPFS with proposer-provided pinning credentials, and create an on-chain proposal that permanently references that document alongside its fixed funding terms. Let members and other visitors retrieve and read the published information without an application backend.

## User Stories

1. As an organizer, I want to write an event proposal in Markdown, so that I can explain the event and funding request clearly.
2. As an organizer, I want a preview of my draft, so that I can check its presentation before publishing.
3. As an organizer, I want to revise my draft before submission, so that I can correct its information without creating blockchain records.
4. As an organizer, I want to provide my own pinning credentials, so that publication does not depend on a shared frontend service secret.
5. As an organizer, I want to pin the exact document I reviewed, so that the recorded proposal points to the intended content.
6. As an organizer, I want upload errors explained separately from transaction errors, so that I know which stage needs retrying.
7. As an organizer, I want to select a treasury and fix my amount and voting deadline, so that the on-chain record captures the request's terms.
8. As an organizer, I want a DAO-wide incrementing proposal ID, so that the event has an unambiguous identity within the deployment.
9. As an organizer, I want the IPFS reference recorded with my proposal, so that readers can find the document I published.
10. As an organizer, I want to retry a rejected blockchain submission without pretending the earlier upload created a proposal, so that I understand the actual publication state.
11. As an organizer, I want any changed draft to require a matching publication reference, so that an old upload cannot silently describe different content.
12. As a member, I want to browse proposals and read their event information, so that I can understand what funds would support.
13. As a visitor, I want to read public proposal documents without connecting a wallet, so that basic information is accessible.
14. As a reader, I want content loaded from the recorded IPFS reference, so that another source cannot silently replace the proposal.
15. As a reader, I want Markdown rendered safely, so that an untrusted author cannot execute scripts in my browser.
16. As a reader, I want unavailable or invalid documents identified, so that missing information is not mistaken for an empty valid proposal.
17. As an organizer, I want proposal creation allowed before voting NFTs exist, so that setup order does not block the POC.
18. As a participant, I want published content and funding terms fixed, so that the request cannot change after people start considering it.

## Implementation Decisions

- This feature owns proposal-document authoring, draft preview, proposal IPFS publication, proposal creation, and public document reading. Public ballots, vote totals, threshold evaluation, and recording passing belong to the separate public-voting feature.
- Use a Markdown editor with a preview. A full collaborative or rich-text editing system is not required. Fix a small versioned proposal-document format and its encoding before publishing stable documents.
- Treat document content as public. Do not include attendee credentials, wallet signatures, pinning credentials, or later attendance data in a proposal document.
- Pin the reviewed document using proposer-provided IPFS credentials. Keep credentials out of browser bundles, persistent proposal data, public documents, logs, and chain transactions. No backend or shared pinning secret is introduced.
- Establish a small reusable IPFS transport interface for upload/retrieval and controlled failure testing. Attendance publication may reuse this transport without sharing proposal-document or cryptographic attendance formats.
- Upload before on-chain proposal creation. Pinning alone does not allocate an ID or create a DAO proposal. Blockchain failure after a successful upload may leave pinned content but no proposal; explain that state and permit retry.
- Bind the prepared reference to the exact reviewed content. Editing after preparation requires publishing the changed document before submitting its reference. Do not silently reuse an obsolete reference.
- Maintain a DAO-wide incrementing proposal ID and mapping. Proposal creation fixes the treasury, creator, TestUSD amount, payout recipient equal to the creator, voting deadline, and proposal-document IPFS reference.
- Anyone can propose against a registered treasury. Holding a voting NFT is not required, and zero current NFT supply does not prevent creation.
- The creator is the event organizer. The proposal's identity and immutable terms form the interface consumed independently by public voting, payouts, and attendance features.
- Once created, the document reference and funding terms cannot be replaced. Draft authoring is distinct from post-publication editing, which is out of scope.
- Resolve documents from the reference in the authenticated on-chain proposal. Validate the expected schema and content-addressed content; an untrusted gateway response is not authority to substitute different information.
- Render untrusted Markdown with safe handling of links and embedded content. Raw HTML or unsafe URL schemes must not execute code. Apply the same safety policy to preview and published-document views.
- Separate document availability from proposal existence. A gateway failure does not mean the on-chain proposal disappeared, and a successful document upload does not mean the proposal exists on-chain.

## Testing Decisions

- Use the application action/read interface for drafting, previewing, pinning, creating, browsing, and reading proposals, with real local contracts for on-chain records.
- Replace the external IPFS transport for deterministic service failures and retrieval responses, not the document encoder, rendering policy, or binding between document and reference.
- Test meaningful Markdown formatting and malicious content in both preview and reader views, including script-bearing HTML and unsafe links.
- Cover failed upload, rejected transaction after upload, retries, edits after pinning, and protection against mismatched document references.
- Verify globally incrementing IDs across multiple treasuries, immutable funding terms/reference, creator identity, and proposal creation with zero voting NFTs using direct contract calls where relevant.
- Test read-only document access, invalid schema, content/reference mismatch, and unavailable IPFS data without conflating them with missing blockchain records.
- Reuse foundation and treasury fixtures. There is no prior editor, IPFS integration, or proposal implementation; avoid introducing a separate harness.

## Out of Scope

- Public voting logic, passing checks, payout execution, and attendance attestations.
- Post-publication amendments, collaborative editing, document history, proposal cancellation, private proposal documents, and a full document-management system.
- Application-operated pinning, shared embedded credentials, and guarantees of permanent IPFS availability.
- Waiting for transparent-ZK feasibility: public proposal documents do not depend on the deferred attendance proof-system investigation.

## Further Notes

Draft editing and IPFS transport can proceed before treasury voting is implemented. Once proposal creation exposes immutable identity and terms, voting and attendance can proceed independently. Proposal documents and attendance datasets are different artifacts even when they reuse the same pinning transport.
