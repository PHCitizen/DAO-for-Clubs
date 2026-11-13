# 04: Fund a treasury with TestUSD

**ID:** 02.04
**Spec:** [Feature 02: Treasuries, TestUSD, and voting membership](../spec.md)
**What to build:** A TestUSD holder can fund a registered treasury and verify the confirmed amount and updated balance.
**Blocked by:** [02.01 — Create a treasury and assign its administrator](01-create-treasury.md).
**Status:** resolved

## Acceptance criteria

- [x] Offer a funding action identifying the selected treasury, shared TestUSD asset, sender, and amount.
- [x] Transfer the amount using the chosen supported ERC20 interaction; request allowance only if that interaction actually requires it, not for an ordinary direct transfer.
- [x] Parse amounts using token decimals and validate invalid amounts, wrong deployments, and insufficient sender balance without inventing successful results.
- [x] After confirmation, show actual sender/treasury balances and distinguish pending submission from completed funding.
- [x] Any TestUSD holder can fund a treasury; treasury-administrator status is not required.
- [x] Behavioral and contract-backed tests cover successful deposits, multiple treasuries, insufficient balance, rejected/failed transactions, and independent refresh after external transfers.

## Scope

Tests may seed holder balances with the existing authorized token fixture; the TestUSD minting UI is not a blocker. Deposits do not approve a proposal or reserve money for one.

## Answer

Implemented on `integration/task-02-04-fund-treasury` in `b673a60`, merged in `ea260dd`, with review fixes in `3945a73`. Funding uses direct TestUSD transfers without allowance, validates the mined Transfer event, and reads actual balances independently. Successful replacements report the mined hash; cancellations and changed amounts cannot produce false confirmations.

Verification: `pnpm build`, `pnpm typecheck`, `pnpm test` (46 frontend tests; 9 contracts/harness tests), and `git diff --check` passed. Standards and spec review findings were addressed, including narrow RPC operations and replacement/cancellation regressions.
