# 01: Cast a yes vote and automatically record passing

**ID:** 04.01
**Spec:** [Feature 04: Public voting and recorded passing](../spec.md)
**What to build:** A voting-NFT holder can support an open proposal once per credential, with passing recorded immediately when the live threshold is reached.
**Blocked by:** [03.03 — Create an on-chain proposal referencing the document](../../03-event-proposals/issues/03-create-onchain-proposal.md); [02.05 — Mint and inspect non-transferable voting NFTs](../../02-treasuries-and-membership/issues/05-mint-voting-nfts.md).
**Status:** needs-triage

## Acceptance criteria

- [x] Accept a public yes ballot only from the current holder of an existing voting NFT belonging to the proposal's treasury.
- [x] Consume the token ID for that proposal and reject repeat use. Multiple NFTs owned by one wallet may vote separately; the same NFT may vote on a different proposal.
- [x] Compute the yes threshold as floor of half the current treasury voting-NFT supply plus one, with no membership/supply snapshot. Newly minted tokens can vote on already open proposals.
- [x] A qualifying ballot records passing in the same transaction and closes voting immediately; passing neither requires nor reserves treasury funds.
- [x] Reject ballots at or after the deadline and after recorded passing, using chain time. Later membership changes cannot undo passing.
- [x] Provide a yes-vote interaction and confirmed totals/result, reusing proposal identity and wallet/network feedback rather than duplicating proposal authoring.
- [x] Real local-contract and application tests cover odd/even/zero starting supply, new mints, duplicate votes, wrong owner/treasury, multiple NFTs, exact deadline guards, and early passing with an empty treasury.

## Scope

Establish shared ballot-consumption and passing rules so the next no-vote and explicit-check tickets extend them consistently. Public ballot browsing and the no-vote user action remain separate.

## Comments

- Implemented on `feat/04-01-yes-vote-and-pass`: DAO `voteYes`, shared open-vote guard and passing helper, live chain-time progress read, application `voteYes`/`readVoting`, and `/proposals/$proposalId` interaction linked from confirmed creation. Passing and ballot state are separate from immutable proposal terms. Receipt verification distinguishes confirmed ballots from unavailable progress refreshes. No-vote and explicit-check actions remain separate tickets. Existing deployments must be redeployed for the new DAO interface.
- Implementation complete, awaiting maintainer review. Verified with `pnpm check`: 49 contracts/local-chain tests and 129 frontend tests pass; builds and TypeScript checks pass. One earlier full-suite run timed out in the existing funding test; the final full run passed without test changes or relaxed checks. Public artifacts were regenerated using `pnpm artifacts:export` (generated ABI JSON is gitignored).
