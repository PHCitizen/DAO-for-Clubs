# 02: Browse treasuries and inspect balances

**ID:** 02.02
**Spec:** [Feature 02: Treasuries, TestUSD, and voting membership](../spec.md)
**What to build:** A read-only visitor can discover DAO-created treasuries and inspect their administrator, funding asset, and current TestUSD balance.
**Blocked by:** [02.01 — Create a treasury and assign its administrator](01-create-treasury.md).
**Status:** done

## Acceptance criteria

- [x] List registered treasuries with stable identity and navigation to a treasury detail view.
- [x] Show the recorded administrator, shared TestUSD identity, and correctly formatted current balance without requiring wallet connection.
- [x] Use authenticated DAO/chain reads rather than a hardcoded demo list or application-operated backend indexer.
- [x] Distinguish an empty registry, nonexistent treasury, loading state, and RPC failure; retry must not duplicate records.
- [x] Refresh reads reflect confirmed external deposits and different treasuries without mixing deployment/account state.
- [x] Behavioral tests use real local treasury registrations and balances, including zero balance, multiple treasuries, wallet-free access, and controlled transport failure.

## Scope

This is discovery and inspection, not a deposit, minting, membership-management, or payout workflow.

## Comments

### Implementation — 2026-11-13

**New files:**
- `packages/frontend/src/treasury.ts` — Wallet-free `createTreasuryReads()` over the DAO/Treasury/TestUSD ABIs. Lists registry identities in order without duplicates, rejects reads from a different chain, and returns `null` for unregistered addresses. Detail reads return the administrator, funding asset, token symbol/decimals, raw balance, and exact `formatUnits` balance.
- `packages/frontend/src/applicationInstance.ts` — One shared application instance for every route.
- `packages/frontend/src/routes/treasuries/index.tsx` — Registry list with loading, empty, unconfigured, chain-mismatch, and RPC retry states plus detail navigation.
- `packages/frontend/src/routes/treasuries/$treasuryAddress.tsx` — Treasury detail with administrator, shared TestUSD identity, formatted balance, refresh, nonexistent, loading, and RPC retry states.
- `packages/contracts/test/browse-treasuries.test.ts` — Real local EVM coverage for empty registry, two treasuries with different administrators, zero balance, externally deposited balance, stable retry, missing address, chain mismatch, and controlled transport failure.

**Extended files:**
- `packages/frontend/src/rpc.ts` — Optional wallet-free `readContract()` on `RpcAdapter`, implemented by the browser RPC adapter.
- `packages/frontend/src/application.ts` — Added `listTreasuries()` and `readTreasury()` with typed success, not-found, unconfigured, chain-mismatch, and rpc-unavailable results.
- `packages/frontend/src/application.test.ts` — Behavioral coverage for empty and multiple registries, stable identity and retry, zero and formatted balances, per-treasury isolation, external-deposit refresh, nonexistent/malformed addresses, RPC recovery, chain mismatch, and wallet-free access that ignores wallet account/network state.
- `packages/frontend/src/routes/index.tsx` — Added navigation to treasury discovery.
- `packages/frontend/src/routeTree.gen.ts` — Regenerated with the treasury routes.
