# 04: Inspect public ballots and voting progress

**ID:** 04.04
**Spec:** [Feature 04: Public voting and recorded passing](../spec.md)
**What to build:** Read-only users can inspect a proposal's public ballots, totals, live threshold, and recorded voting outcome without confusing them with funding or attendance.
**Blocked by:** [04.02 — Cast a no vote](02-vote-no.md); [04.03 — Explicitly record passing after NFT burns](03-record-passing-after-burns.md).
**Status:** implementation-complete

## Acceptance criteria

- [x] Show public ballot identities, token IDs, choices, yes/no totals, and the current treasury NFT supply/threshold using authenticated contract reads/events.
- [x] Distinguish open, recorded passed, and deadline-closed-without-passing states using chain time and recorded state rather than a client timer alone.
- [x] Explain live-supply administrator influence and distinguish a currently sufficient tally from a passing result that was actually recorded before close.
- [x] Refresh after confirmed ballots and membership mutations without removing historical burned-token votes or fabricating automatic passing.
- [x] Support wallet-free inspection and honest loading/transport-error states without a backend indexer.
- [x] Tests cover both ballot choices, burn/mint threshold changes, exact close, irreversible passing, retained historical ballots, and separation from payment/attendance status.

## Scope

Reuse the proposal's document/reference rather than adding another editor or publication flow. This is a read workflow, not authority to reopen closed votes.

## Comments

- 2026-11-13: Implemented on a worktree branched from `main` at `ee6f1c2` (06.03) with `8b14ad7` (04.03, checkPassing) already merged. No contract changes: the DAO already emits `YesVoteCast`/`NoVoteCast`/`ProposalPassed` and exposes `getVoting`, so this ticket is purely a read workflow. Added `packages/frontend/src/ballots.ts` (`readPublicBallots`) which rebuilds the public ballot list for a proposal by querying `YesVoteCast`/`NoVoteCast` event logs directly through a new optional `getLogs` seam on `RpcAdapter` (`packages/frontend/src/rpc.ts`) and `ProposalChain` (`packages/frontend/src/proposalCreation.ts`) — no backend indexer. Because the log record is append-only, a ballot survives the token that cast it being burned. Wired into the application as `app.readBallots(proposalId)` (`BallotListResult` in `packages/frontend/src/application.ts`), which reuses the existing `readVoting`/`getVoting` read for totals/threshold/outcome rather than re-deriving them from logs, keeping the two reads' shapes (`Ballot` vs `VotingProgress`) structurally disjoint from funding/attendance types. Added a new UI section `packages/frontend/src/routes/proposals/-ballots.tsx` (`PublicBallotList`), rendered in `$proposalId.tsx` as its own section separate from `ProposalVotingPanel`, `ProposalFundingPanel`, and `AttendanceScanPanel` — it states that treasury administrators control live NFT supply/threshold, and shows a distinct "currently qualifies but not yet recorded" notice (derived from `yesVotes >= threshold` while `outcome === 'open'`) instead of conflating a transient tally with a recorded passing result.
- 2026-11-13: Verified with `pnpm check` equivalents: contracts tests pass 77/77 (new `packages/contracts/test/inspect-public-voting.test.ts` adds 6 real-chain subtests: both ballot choices with voter/tokenId/choice, threshold reflecting burns and mints, the exact deadline boundary between open and closed-without-passing, irreversibility of recorded passing across later mint/burn including a never-checked transiently-sufficient tally correctly reading as closed-without-passing, retained historical ballots for burned tokens, and a structural-separation assertion that the ballot/voting read shapes carry no funding or attendance keys); frontend tests pass 217/217 (new `packages/frontend/src/ballots.test.ts` and `packages/frontend/src/application.ballots.test.ts` cover chain-mismatch, both-choice decoding, not-found, unconfigured, and rpc-unavailable). Workspace build and TypeScript checks pass. Rebuilt contracts, redeployed to an isolated local Hardhat node (port 18545), and ran `pnpm artifacts:export`; no generated manifest/ABI JSON committed. `origin/main` had advanced past this ticket's base (05.01 fund release, PR #25/#24) during work; merged it in, resolving conflicts in `packages/frontend/src/application.ts` (combined the `ballots.js`/`release.js` imports) and `packages/frontend/src/routes/proposals/$proposalId.tsx` (rendered `PublicBallotList` alongside `ProposalFundingPanel`), then reran `pnpm check` (rebuild/redeploy/re-export first, since `DAO.sol` had gained `releaseFunds`) with all tests, build, and typecheck passing. No scope changes beyond this ticket.
