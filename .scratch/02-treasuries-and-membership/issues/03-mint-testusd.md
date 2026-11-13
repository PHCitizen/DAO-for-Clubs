# 03: Mint TestUSD with its designated administrator

**ID:** 02.03
**Spec:** [Feature 02: Treasuries, TestUSD, and voting membership](../spec.md)
**What to build:** The separately designated TestUSD administrator can mint currency to a recipient and inspect the confirmed result.
**Blocked by:** [02.01 — Create a treasury and assign its administrator](01-create-treasury.md).
**Status:** done

## Acceptance criteria

- [x] Expose a recipient/amount minting interaction for the shared TestUSD contract and validate inputs using its actual decimals without floating-point amount errors.
- [x] Only the designated TestUSD administrator can mint on-chain. A treasury administrator without that role is rejected even through a direct contract call.
- [x] Successful confirmation shows the actual minted amount and updated recipient balance; rejection or transaction failure must not appear as minting success.
- [x] Keep minting in the existing shared currency rather than deploying a separate token per treasury.
- [x] Tests cover authorized minting, unauthorized minting, role separation, amount handling, and transaction feedback using real local token state.
- [x] No administrator key is embedded in browser code; signatures use the connected authorized wallet.

## Scope

No faucet policy, mainnet economics, currency conversion, or automatic grant of currency authority to treasury creators.

## Comments

### Implementation — 2026-11-13

**New files:**
- `packages/frontend/src/testusd.ts` — Wallet-free metadata reads plus the `mintTestUsd()` action. Reads the shared token's symbol, decimals, and `currencyAdmin`; parses user amounts as exact base units with `parseUnits` after an explicit fractional-digit check; rejects non-administrators before sending; submits through the injected chain seam; waits for a confirmed receipt; decodes the `Transfer(address(0), recipient, amount)` log so the reported amount is the amount actually minted; then re-reads the recipient balance. Domain errors distinguish chain mismatch, submission failure, reverted receipt, and unconfirmed/undecodable/unreadable confirmation.
- `packages/frontend/src/walletState.ts` — Shared `useWalletState()` / `useNetworkState()` hooks used by the home and mint routes.
- `packages/frontend/src/routes/testusd.tsx` — Shared-token identity, signing-wallet panel with administrator-role hint, wrong-network switch guidance, recipient/amount form with exact-unit preview, and result states for confirmed mint, invalid input, unauthorized account, wallet rejection, submission/revert/confirmation failure, chain mismatch, RPC failure, and unconfigured deployment.
- `packages/contracts/test/mint-testusd.test.ts` — Real local EVM coverage for metadata, exact amount parsing, authorized minting with confirmed balance, smallest-unit minting, treasury-administrator rejection through both the action and a direct contract call, a reverting mint that leaves the balance unchanged, and chain mismatch.

**Extended files:**
- `packages/frontend/src/wallet.ts` — `WalletAdapter.sendTransaction()` encodes `mint` calldata and submits `eth_sendTransaction` from the connected wallet; no key is embedded. Wallet errors are normalized as `TransactionRejectedError` (EIP-1193 code 4001) or `TransactionSubmissionError`.
- `packages/frontend/src/rpc.ts` — Optional `waitForTransactionReceipt()` on `RpcAdapter`, returning confirmed status, block number, and logs.
- `packages/frontend/src/application.ts` — Added `readTestUsd()` and `mintTestUsd()` with typed success/unauthorized/invalid/unconfigured/chain-mismatch/rpc-unavailable/wallet-rejected/transaction-failed results. Submission errors preserve the rejection cause so a wallet rejection is never reported as success.
- `packages/frontend/src/application.test.ts` — Behavioral coverage for wallet-free metadata, invalid amounts/recipients, treasury-administrator rejection, decoded minted amount and updated balance, wallet rejection, submission failure, reverted receipt, unconfirmed transaction, balance-read failure, and required wallet connection.
- `packages/frontend/src/routes/index.tsx` — Added navigation to the mint route and moved wallet/network subscriptions to the shared hooks.
- `packages/frontend/src/routeTree.gen.ts` — Regenerated with `/testusd`.

**Notes:**
- `parseUnits` silently truncates excess decimal places, so the parser counts fractional digits explicitly before parsing. Amounts are never handled as floating-point numbers.
- Hardhat's local EVM rejects a reverting transaction during submission by default, so the real-chain test accepts a failure at either submission or receipt and verifies the recipient balance is unchanged. The reverted-receipt branch itself is covered by a controlled application test.

