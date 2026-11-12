# 03: Mint TestUSD with its designated administrator

**ID:** 02.03
**Spec:** [Feature 02: Treasuries, TestUSD, and voting membership](../spec.md)
**What to build:** The separately designated TestUSD administrator can mint currency to a recipient and inspect the confirmed result.
**Blocked by:** [02.01 — Create a treasury and assign its administrator](01-create-treasury.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Expose a recipient/amount minting interaction for the shared TestUSD contract and validate inputs using its actual decimals without floating-point amount errors.
- [ ] Only the designated TestUSD administrator can mint on-chain. A treasury administrator without that role is rejected even through a direct contract call.
- [ ] Successful confirmation shows the actual minted amount and updated recipient balance; rejection or transaction failure must not appear as minting success.
- [ ] Keep minting in the existing shared currency rather than deploying a separate token per treasury.
- [ ] Tests cover authorized minting, unauthorized minting, role separation, amount handling, and transaction feedback using real local token state.
- [ ] No administrator key is embedded in browser code; signatures use the connected authorized wallet.

## Scope

No faucet policy, mainnet economics, currency conversion, or automatic grant of currency authority to treasury creators.
