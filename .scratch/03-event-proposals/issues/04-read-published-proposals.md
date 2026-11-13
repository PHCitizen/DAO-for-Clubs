# 04: Browse proposals and read published Markdown

**ID:** 03.04
**Spec:** [Feature 03: Proposal authoring and IPFS publication](../spec.md)
**What to build:** Members and other visitors can discover on-chain proposals and read their published event information without connecting a wallet.
**Blocked by:** [03.03 — Create an on-chain proposal referencing the document](03-create-onchain-proposal.md).
**Status:** done

## Acceptance criteria

- [x] Provide proposal discovery and details identifying the deployment, global proposal ID, treasury, creator, funding amount, deadline, and recorded document reference.
- [x] Retrieve the versioned document from the on-chain reference and validate its schema and content-addressed content before rendering it as the proposal's information.
- [x] Reuse the editor's safe Markdown rendering policy; malicious HTML and unsafe links must not execute code in the published view.
- [x] Wallet-free readers can inspect documents. Do not add an NFT membership gate or backend indexer for public proposal information.
- [x] Distinguish nonexistent proposals, unavailable IPFS content, invalid documents, reference/content mismatch, and transport failures; a document failure does not erase the on-chain record.
- [x] Behavioral tests cover real local proposal records, multiple treasuries, safe rendering, wrong/malformed content, retrieval failure and retry, and access without a wallet.

## Scope

Show proposal information, not an independently implemented voting engine. Public ballots, current thresholds, and detailed voting outcomes belong to the voting feature.

## Comments

### Implementation — 2026-11-13

**Frontend (`packages/frontend/src`):**
- `application.ts` — new wallet-free reads: `listProposals()` (every on-chain proposal, newest first, with formatted TestUSD amount and deployment `chainId`/`daoAddress`; documents are not fetched) and `readPublishedProposal(id)` (the on-chain record plus a `document` state). It reuses `readProposal`, so nonexistent IDs return `not-found` and chain/RPC problems reuse the shared `unconfigured`/`rpc-unavailable`/`chain-mismatch` failures. No wallet adapter, NFT gate, or indexer is involved.
- `publishedProposals.ts` — `readPublishedDocument()` turns the recorded reference into `available` (title, Markdown, sanitized HTML via the existing `renderProposalMarkdown`) or a failure with `retryable`: `invalid-reference`, `unavailable` (gateway 404/410), `transport-failure`, `content-mismatch`, `invalid-document` (03.02 `decodeProposalDocument` schema/version rules). A failure never replaces the on-chain record; retrying is calling the read again.
- `ipfsContent.ts` — `verifyContentAddress()` re-hashes retrieved bytes (SHA-256; raw codec and single-chunk UnixFS dag-pb, CIDv0 and CIDv1) before parsing, so an untrusted gateway cannot substitute content. Larger or unsupported layouts report `unverifiable` (surfaced as `invalid-reference`).
- `ipfs.ts` — `IpfsTransportError` gains reason `content-not-found` (404/410) so missing content is distinct from other gateway/transport failures.
- Routes: `/proposals` (list), `/proposals/$proposalId` (record, rendered document, retry), plus a home link.

**Tests:** `published-proposals.test.ts` and `ipfsContent.test.ts` (application seam; CID vectors from the known `ipfs add` result and an independent hash), and `packages/contracts/test/published-proposals.test.ts` (real local EVM, several treasuries, no wallet, unavailable/mismatch/malformed/gateway-down and recovery). `pnpm check` and `pnpm typecheck` pass.

**Notes:** Voting results/thresholds are intentionally not shown. Documents above one 256 KiB chunk cannot be verified by this client.

### Review fixes — 2026-11-13

- Document failures now distinguish `invalid-reference` (malformed), `unverifiable-reference` (unsupported codec or larger than one chunk), and `transport-unconfigured` (non-retryable).
- Authoring refuses documents over `MAX_PROPOSAL_DOCUMENT_BYTES` (256 KiB, tied to the verifier's single-chunk limit) with `invalid-draft`; the decoder enforces the same limit.
- `listProposals()` returns `gaps` (IDs whose record could not be read) and reads in batches of 10.
- Route copy uses "proposal document"; shared `-ReadFailure.tsx`; non-numeric URL IDs are an `invalid-id` page state.
