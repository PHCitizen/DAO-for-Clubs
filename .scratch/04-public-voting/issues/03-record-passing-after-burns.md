# 03: Explicitly record passing after NFT burns

**ID:** 04.03
**Spec:** [Feature 04: Public voting and recorded passing](../spec.md)
**What to build:** Anyone can trigger a passing check while voting is open, including when NFT burns have made existing yes votes sufficient without another ballot.
**Blocked by:** [04.01 — Cast a yes vote and automatically record passing](01-vote-yes-and-pass.md); [02.06 — Burn voting NFTs without reusing IDs](../../02-treasuries-and-membership/issues/06-burn-voting-nfts.md).
**Status:** implementation-complete

## Acceptance criteria

- [x] Expose the permissionless passed interaction using the same current-supply threshold and irreversible passing state as ballot transactions.
- [x] Demonstrate six NFTs and three yes votes, followed by two burns: an explicit check before deadline records passing without a fourth vote.
- [x] Burning does not remove previously cast votes or reset token consumption; new minting can raise the threshold before passing is recorded.
- [x] Require sufficient recorded yes votes and an open vote. Reject a first passing record at/after deadline even if the threshold was satisfied earlier without a transaction.
- [x] Once recorded, passing survives later minting/burning and closes further voting. Treasury balance is irrelevant.
- [x] Provide clear check/result feedback without presenting the transaction as a payout or an administrative approval.
- [x] Real-contract and application tests cover the concrete burn scenario, burned-voter vote retention, failed threshold checks, exact deadline, and irreversible passing. Include current supply zero with and without retained yes votes.

## Scope

No historical supply tracking, snapshots, automatic timer execution, or retroactive passing after vote close. The shared check is also consumed by the release interaction.

## Comments

- 2026-11-13: Implemented on a worktree branched from `main` at `9acf512` (04.01) with `b052de9` (02.06) already merged. Added `DAO.checkPassing(proposalId)`, reusing the existing `_requireOpenVote` guard and `_recordPassingIfQualified`/`_yesThreshold` helpers from `voteYes` rather than duplicating threshold or passing logic, so the same helper is ready for the fund-release interaction. `checkPassing` reverts `InsufficientYesVotes` when recorded yes votes are below the current-supply threshold, and reuses `VotingClosed` (already passed, or at/after the deadline) from the shared guard — it cannot record passing where a ballot could not. Added application `checkPassing` (`packages/frontend/src/voting.ts` `checkProposalPassing`, wired into `packages/frontend/src/application.ts`) with its own `PassingCheckSubmissionError`/`PassingCheckRevertedError`/`PassingCheckConfirmationError` taxonomy and a receipt check against the `ProposalPassed` event (matching proposal ID), mirroring the existing `voteYes`/`castYesVote` pattern. The `/proposals/$proposalId` voting panel exposes a "Check passing" button and copy explicitly described as a vote-passing check only — never a payout or administrative approval — separate from the yes-vote button and its messaging.
- 2026-11-13: Verified with `pnpm check`: 57 contract/local-chain tests (new `packages/contracts/test/check-passing.test.ts` adds 7, including the application-driven path through `app.checkPassing`) and 157 frontend tests (new cases added to `packages/frontend/src/voting.test.ts`) pass; workspace build and TypeScript checks pass. The new contract test covers the ticket's concrete 6-NFT/3-yes-vote/2-burn scenario, a burn-then-check with retained votes at zero current supply (with and without a retained yes vote), insufficient-yes-vote rejection (including after minting raises the threshold further), rejection once already passed and at the exact deadline boundary, and irreversibility of recorded passing across later minting and burning. Updated the existing `proposal-creation.test.ts` assertion that enumerates the DAO's mutating functions to include `checkPassing`. Generated local deployment/ABIs on an isolated node (port 8577) via `pnpm deploy:local`-equivalent steps and `pnpm artifacts:export`; no generated manifest or ABI JSON committed. No scope changes beyond this ticket.
