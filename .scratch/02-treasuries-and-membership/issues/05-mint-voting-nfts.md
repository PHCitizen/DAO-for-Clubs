# 05: Mint and inspect non-transferable voting NFTs

**ID:** 02.05
**Spec:** [Feature 02: Treasuries, TestUSD, and voting membership](../spec.md)
**What to build:** A treasury administrator can issue voting NFTs, and holders can inspect which credentials belong to which treasury.
**Blocked by:** [02.01 — Create a treasury and assign its administrator](01-create-treasury.md).
**Status:** resolved

## Acceptance criteria

- [ ] Only the treasury's administrator can mint its voting NFTs to a specified holder; unauthorized direct calls fail.
- [ ] Expose unambiguous treasury-scoped token identity, current owner, and live supply for later voting. Permit multiple NFTs per wallet; voting weight is not automatically restricted to one per person.
- [ ] Token IDs are allocated monotonically or with another guaranteed never-reused scheme that the later burn workflow cannot reset.
- [ ] All exposed NFT transfer paths reject, including applicable safe-transfer overloads; hiding a transfer button is not sufficient.
- [ ] Provide administrator issuance feedback and holder inspection with confirmed ownership/supply, including isolation across multiple treasuries.
- [ ] Real-contract and application-interface tests cover authorization, multiple credentials/holders, wrong-treasury isolation, fresh IDs, transfer rejection, and failed mint feedback.

## Scope

Burning and its user interaction belong to the next membership ticket. Do not introduce delegation, personhood checks, snapshots, or transferable credentials.

## Comments

- 2026-11-13: Implemented on `integration/task-02-05-mint-voting-nfts` (PR #9). Voting NFTs live in `Treasury.sol` (admin-only `mintVotingNft`, monotonic never-reused IDs, all transfer/approval paths revert `VotingNftTransferDisabled`); frontend `membership` module exposes `mintVotingNft`/`readVotingMembership` through the application seam with a treasury-page membership panel. Tests: contract-level (`voting-nfts.test.ts`), application-on-real-EVM (`contracts/test/membership.test.ts`), stubbed behavioral (`frontend/src/membership.test.ts`); 33/33 contracts, 84/84 frontend, typecheck/build green. Code review (standards + spec axes) passed; review fixes in commit 8001929. All six acceptance criteria verified by the spec-axis review.
