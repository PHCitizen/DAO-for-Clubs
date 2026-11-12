# 02: Browse treasuries and inspect balances

**ID:** 02.02
**Spec:** [Feature 02: Treasuries, TestUSD, and voting membership](../spec.md)
**What to build:** A read-only visitor can discover DAO-created treasuries and inspect their administrator, funding asset, and current TestUSD balance.
**Blocked by:** [02.01 — Create a treasury and assign its administrator](01-create-treasury.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] List registered treasuries with stable identity and navigation to a treasury detail view.
- [ ] Show the recorded administrator, shared TestUSD identity, and correctly formatted current balance without requiring wallet connection.
- [ ] Use authenticated DAO/chain reads rather than a hardcoded demo list or application-operated backend indexer.
- [ ] Distinguish an empty registry, nonexistent treasury, loading state, and RPC failure; retry must not duplicate records.
- [ ] Refresh reads reflect confirmed external deposits and different treasuries without mixing deployment/account state.
- [ ] Behavioral tests use real local treasury registrations and balances, including zero balance, multiple treasuries, wallet-free access, and controlled transport failure.

## Scope

This is discovery and inspection, not a deposit, minting, membership-management, or payout workflow.
