# 02: Cast a no vote

**ID:** 04.02
**Spec:** [Feature 04: Public voting and recorded passing](../spec.md)
**What to build:** An eligible voting-NFT holder can publicly oppose a proposal, permanently consuming that credential's vote for the proposal.
**Blocked by:** [04.01 — Cast a yes vote and automatically record passing](01-vote-yes-and-pass.md).
**Status:** needs-triage

## Acceptance criteria

- [x] Provide a no-vote action using the same treasury NFT ownership, open-vote, and chain/deployment checks as yes voting.
- [x] Record the no ballot and its public choice, updating no totals without treating participation alone as approval.
- [x] Consume the NFT's vote regardless of choice: no-then-yes, yes-then-no, and repeated no submissions all fail for the same proposal/token.
- [x] Retain the one-vote-per-token rule across wallets and the ability to vote separately with other owned NFTs or on other proposals.
- [x] Apply the shared live-threshold check to a vote transaction; if existing yes votes already qualify after a supply change, record passing consistently rather than inventing a different rule for no ballots.
- [x] Confirmation identifies the actual ballot/result; rejected, unauthorized, or closed-vote submissions do not change totals.
- [x] Real local-chain and application tests cover no voting, cross-choice duplication, ownership/treasury isolation, deadline/early-close rejection, and participation without sufficient yes votes.

## Scope

Do not make ballots changeable or introduce an abstention/participation quorum. Full public activity browsing is a separate ticket.

## Comments

- Implemented task 04.02 in the implementation worktree based on `feat/04-02-no-vote`. Shared contract ballot casting retains the existing ownership, consumption, open-vote and passing rules. Added `voteNo`, public `NoVoteCast`, and a no total appended to `getVoting`; application submission and receipt checks share both choices, and the proposal panel offers both actions with separate totals and choice-specific confirmation. Public activity browsing remains out of scope.
- Implementation complete, awaiting maintainer code review; no commit made. Code was written before tests as requested. Verified with `pnpm check`: 53 contracts/local-chain tests and 155 frontend tests pass, plus builds and TypeScript checks. A test exposed opposite-choice event decoding; receipt verification now explicitly checks the decoded event name. Updated the immutable-proposal mutator allowlist for the added voting action without changing proposal terms. Existing deployments must be redeployed and public artifacts regenerated for the updated ABI.
- Addressed code-review naming feedback: renamed the shared application result type from `YesVoteResult` to `VoteResult` for both voting choices and shared submission. No compatibility alias is needed because there are no other references. Reverified with `pnpm check` (53 contracts/local-chain tests, 155 frontend tests, builds and TypeScript checks) and `git diff --check`; no commit made.
