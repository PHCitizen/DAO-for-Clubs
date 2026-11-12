# 03: Create an on-chain proposal referencing the document

**ID:** 03.03
**Spec:** [Feature 03: Proposal authoring and IPFS publication](../spec.md)
**What to build:** An organizer creates a proposal against a treasury using the prepared IPFS document and receives an immutable, globally identified on-chain record.
**Blocked by:** [03.02 — Pin the reviewed proposal document to IPFS](02-pin-proposal-document.md); [02.01 — Create a treasury and assign its administrator](../../02-treasuries-and-membership/issues/01-create-treasury.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Create against a registered treasury with fixed creator, requested TestUSD amount, payout recipient equal to the creator, voting deadline, and prepared proposal-document reference.
- [ ] Assign a DAO-wide incrementing proposal ID stored in a mapping; creation across different treasuries uses the same global sequence.
- [ ] Anyone may propose regardless of NFT ownership, including when current treasury voting-NFT supply is zero.
- [ ] Confirm the actual assigned ID and recorded terms in the application. Expose the identity/terms/read interface needed independently by voting, payouts, and attendance.
- [ ] Do not submit an obsolete prepared reference after draft edits. A failed transaction after successful pinning remains a document-only result, with explicit retry rather than a fabricated proposal.
- [ ] Published funding terms and the document reference cannot be edited after creation. Validate malformed creation inputs and invalid treasury references without allocating a successful proposal record.
- [ ] Real local-chain and application tests cover global IDs, creator/recipient identity, immutable fields, zero NFT supply, rejected submission, and retry after a successful upload.

## Scope

This establishes the proposal record and creation confirmation, not Markdown reimplementation, public voting, payout execution, or attendance finalization. Define the minimal shared state/interface without implementing those workflows prematurely.
