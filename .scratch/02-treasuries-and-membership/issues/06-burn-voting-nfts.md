# 06: Burn voting NFTs without reusing IDs

**ID:** 02.06
**Spec:** [Feature 02: Treasuries, TestUSD, and voting membership](../spec.md)
**What to build:** A treasury administrator can remove a voting credential, see the live supply decrease, and issue later credentials without ever reusing the burned ID.
**Blocked by:** [02.05 — Mint and inspect non-transferable voting NFTs](05-mint-voting-nfts.md).
**Status:** resolved

## Acceptance criteria

- [x] Allow only that treasury's administrator to burn one of its existing voting NFTs, including a token held by another wallet.
- [x] Confirm the credential is no longer owned/active and show the updated live supply. Reject missing, already burned, or wrong-treasury token references.
- [x] Minting after burning produces a fresh ID; burning must not reset allocation or permit reminting an old identifier.
- [x] Preserve the integration rule that burn changes current supply, not historical proposal ballots or per-proposal consumption. Do not add vote deletion or membership snapshots.
- [x] Distinguish confirmed removal from wallet rejection and transaction failure in the administrator workflow.
- [x] Real local-chain and application tests cover authorization, repeated burns, cross-treasury isolation, supply changes, and burn-then-mint ID freshness.

## Scope

The effect on recorded passing is demonstrated in the explicit passing-check ticket. This ticket supplies the real membership mutation, not a mock supply override.

## Answer

Implemented administrator-only `Treasury.burnVotingNft`, with constant-time removal from live holder enumeration and a standard Transfer-to-zero event. The monotonic allocator is untouched. The public application burn action verifies the matching removal event and reads updated holder credentials/live supply; the treasury panel supports burning another wallet's token and distinguishes rejection, failed submission, revert, uncertain confirmation, and confirmed removal. Token identity remains the treasury/ID pair. No proposal history, consumption, snapshots, or payment authority changes.

## Comments

- 2026-11-13: Claimed on `task/02-06-burn-voting-nfts` after confirming integration tip `fd0503e` is an ancestor. Read feature spec and predecessor 02.05. Implemented code first, then tests, without TDD.
- 2026-11-13: Evidence: `packages/contracts/test/burn-voting-nfts.test.ts` checks direct on-chain authorization (including holder rejection), removal events, absent ownership, supply/enumeration, repeated/missing/wrong-treasury burns, emptying a holder, and fresh allocation. `packages/contracts/test/membership.test.ts` exercises burn through the application against a real local EVM, including independent treasury admins, wallet rejection, reverted transactions, holder reads, and fresh ID 4 after burning ID 1. `packages/frontend/src/membership.test.ts` adds application behavior coverage for confirmation, validation, authorization, failure stages, and missing receipt events.
- 2026-11-13: Verification: `pnpm check` passes (34 contract tests, 104 frontend tests; workspace build and TypeScript checks); `git diff --check` passes. Generated local deployment/ABIs using an isolated node on port 8566; used null deployment addresses in the ignored manifest for existing default-unconfigured application tests. No generated artifacts or local deployment state committed.
- 2026-11-13: Self-review against standards/spec: reused existing wallet preparation/freshness guards, RPC seams, and error taxonomy; fixed burn-specific failure wording; indexed holder removal avoids unbounded scanning. Burn does not touch proposal ballots or per-proposal consumption. Holder enumeration order is not guaranteed (swap-and-pop). Existing deployed immutable contracts need redeployment to expose burning; proposal passing-check effects remain the owning ticket's scope. No feature map exists to update.
