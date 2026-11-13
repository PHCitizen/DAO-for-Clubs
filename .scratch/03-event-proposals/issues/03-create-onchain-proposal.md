# 03: Create an on-chain proposal referencing the document

**ID:** 03.03
**Spec:** [Feature 03: Proposal authoring and IPFS publication](../spec.md)
**What to build:** An organizer creates a proposal against a treasury using the prepared IPFS document and receives an immutable, globally identified on-chain record.
**Blocked by:** [03.02 — Pin the reviewed proposal document to IPFS](02-pin-proposal-document.md); [02.01 — Create a treasury and assign its administrator](../../02-treasuries-and-membership/issues/01-create-treasury.md).
**Status:** done

## Acceptance criteria

- [x] Create against a registered treasury with fixed creator, requested TestUSD amount, payout recipient equal to the creator, voting deadline, and prepared proposal-document reference.
- [x] Assign a DAO-wide incrementing proposal ID stored in a mapping; creation across different treasuries uses the same global sequence.
- [x] Anyone may propose regardless of NFT ownership, including when current treasury voting-NFT supply is zero.
- [x] Confirm the actual assigned ID and recorded terms in the application. Expose the identity/terms/read interface needed independently by voting, payouts, and attendance.
- [x] Do not submit an obsolete prepared reference after draft edits. A failed transaction after successful pinning remains a document-only result, with explicit retry rather than a fabricated proposal.
- [x] Published funding terms and the document reference cannot be edited after creation. Validate malformed creation inputs and invalid treasury references without allocating a successful proposal record.
- [x] Real local-chain and application tests cover global IDs, creator/recipient identity, immutable fields, zero NFT supply, rejected submission, and retry after a successful upload.

## Scope

This establishes the proposal record and creation confirmation, not Markdown reimplementation, public voting, payout execution, or attendance finalization. Define the minimal shared state/interface without implementing those workflows prematurely.

## Comments

### Implementation — 2026-11-13

**Contract (`packages/contracts/contracts/DAO.sol`):**
- Added `Proposal { id, treasury, creator, amount, payoutRecipient, votingDeadline, documentReference }`, `proposalCount`, and a private `mapping(uint256 => Proposal)` with `getProposal(id)` as the read interface for voting, payouts, and attendance.
- `createProposal(treasury, amount, votingDeadline, documentReference)` requires a DAO-registered treasury, positive amount, future deadline, and non-empty reference; it assigns `++proposalCount` (one global sequence across all treasuries) and sets `creator = payoutRecipient = msg.sender`. No NFT check exists, so zero voting-NFT supply never blocks creation.
- Immutability is structural: the only non-view DAO entry points remain `createTreasury` and `createProposal`; there is no setter for any proposal field. `ProposalCreated` carries the assigned ID for confirmation decoding. Custom errors: `TreasuryNotRegistered`, `InvalidProposalAmount`, `InvalidVotingDeadline`, `InvalidDocumentReference`, `ProposalNotFound`.
- Deployment constructor is unchanged, so `pnpm deploy:local` regenerates the gitignored manifest and frontend artifact JSON with the new ABI.

**Frontend:**
- `packages/frontend/src/proposalCreation.ts` — Chain seam plus `createProposalOnChain()`, `readProposalTerms()`, and `readProposalCount()`. Validates the treasury address/registration, amount via the shared exact-decimal parser, future deadline, and `ipfs://` reference before sending; decodes the actual assigned ID from `ProposalCreated`; then reads the record back and requires every stored term to match before reporting success. Errors distinguish chain mismatch, submission failure, reverted receipt, and confirmation failure.
- `packages/frontend/src/application.ts`
  - `createProposal({ treasury, amount, votingDeadline })` uses the currently pinned reference only. `draft-changed` returns `stale-reference` without any transaction; any non-pinned state returns `not-pinned`.
  - Creation state machine: `idle`, `submitting`, `pending` (hash), `confirmed`, `rejected`, and retryable `failed`. Failure/rejection states keep the document reference and state plainly that the document is still pinned while no proposal exists; an explicit retry uses the same pinned document.
  - `readProposal(id)` and `readProposalCount()` expose the identity/terms read interface with formatted TestUSD amounts and shared chain/RPC failure mapping.
- `packages/frontend/src/routes/proposals/-create.tsx` — Creation panel on `/proposals/new`: registered-treasury selector, amount and datetime deadline inputs, wallet/network gating, and confirmed record (ID, terms, reference, transaction hash) or document-only failure with retry.

**Tests:**
- `packages/contracts/test/proposal-creation.test.ts` — Real local EVM: global IDs across treasuries, creator/payout-recipient identity, recorded terms, event-derived ID, zero NFT supply, rejected malformed inputs with no allocated record, immutability (ABI has no proposal setters), and unknown-ID reads.
- `packages/contracts/test/proposal-creation-app.test.ts` — The same frontend module against a real local EVM: confirmed terms and read-back, smallest-unit amounts, zero NFT supply, input validation without submission, and a failed creation followed by a successful retry.
- `packages/frontend/src/proposal-creation.test.ts` — Application workflow: pinned/stale reference rules, assigned ID and immutable terms with global sequencing, no NFT dependency, wallet rejection leaving a document-only result, reverted transaction with explicit retry, malformed inputs never reaching the wallet, and unconfigured/wallet requirements.

**Notes:**
- `pnpm check` passes: 118 frontend tests and 43 contract tests, plus builds and typechecks.
- Voting, payout execution, and attendance finalization were intentionally not added; they consume `getProposal`/`readProposal` only.
