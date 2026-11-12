# 04: Browse proposals and read published Markdown

**ID:** 03.04
**Spec:** [Feature 03: Proposal authoring and IPFS publication](../spec.md)
**What to build:** Members and other visitors can discover on-chain proposals and read their published event information without connecting a wallet.
**Blocked by:** [03.03 — Create an on-chain proposal referencing the document](03-create-onchain-proposal.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Provide proposal discovery and details identifying the deployment, global proposal ID, treasury, creator, funding amount, deadline, and recorded document reference.
- [ ] Retrieve the versioned document from the on-chain reference and validate its schema and content-addressed content before rendering it as the proposal's information.
- [ ] Reuse the editor's safe Markdown rendering policy; malicious HTML and unsafe links must not execute code in the published view.
- [ ] Wallet-free readers can inspect documents. Do not add an NFT membership gate or backend indexer for public proposal information.
- [ ] Distinguish nonexistent proposals, unavailable IPFS content, invalid documents, reference/content mismatch, and transport failures; a document failure does not erase the on-chain record.
- [ ] Behavioral tests cover real local proposal records, multiple treasuries, safe rendering, wrong/malformed content, retrieval failure and retry, and access without a wallet.

## Scope

Show proposal information, not an independently implemented voting engine. Public ballots, current thresholds, and detailed voting outcomes belong to the voting feature.
