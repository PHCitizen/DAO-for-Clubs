# 02: Connect and track the wallet account

**ID:** 01.02
**Spec:** [Feature 01: Browser application foundation](../spec.md)
**What to build:** A visitor can connect a supported wallet, see the active account, switch accounts, and disconnect without stale application session state.
**Blocked by:** [01.01 — Scaffold and run the pnpm workspace](01-scaffold-pnpm-workspace.md).
**Status:** done

## Acceptance criteria

- [ ] Offer a wallet connection action and display the active account after a successful connection.
- [ ] Wallet account changes and disconnects update application state; future action preparation cannot silently retain an obsolete account.
- [ ] Wallet absence, rejected connection, and recoverable connection errors have actionable feedback and allow retry without reloading.
- [ ] Read-only application content remains accessible without connecting a wallet.
- [ ] Use viem-compatible wallet interaction and never request a raw private key or introduce a hosted account backend.
- [ ] Behavioral tests cover connect, reject, switch account, disconnect, and reconnect through the application interface with a controlled wallet adapter; include a documented real-wallet smoke check.

## Acceptance criteria

- [x] Offer a wallet connection action and display the active account after a successful connection.
- [x] Wallet account changes and disconnects update application state; future action preparation cannot silently retain an obsolete account.
- [x] Wallet absence, rejected connection, and recoverable connection errors have actionable feedback and allow retry without reloading.
- [x] Read-only application content remains accessible without connecting a wallet.
- [x] Use viem-compatible wallet interaction and never request a raw private key or introduce a hosted account backend.
- [x] Behavioral tests cover connect, reject, switch account, disconnect, and reconnect through the application interface with a controlled wallet adapter; include a documented real-wallet smoke check.

## Scope

Network switching is a separate ticket. Attendance-signature reproducibility is not established by ordinary wallet connection.

## Comments

### Implementation — 2026-11-12

**New files:**
- `src/wallet.ts` — `WalletAdapter` interface, `createBrowserWalletAdapter()` (EIP-1193 / viem-compatible), domain error types (`WalletUnavailableError`, `WalletRejectedError`, `WalletConnectError`), `normalizeWalletError()`.
- `src/application.ts` (extended) — `createApplication(adapter?)` gains `connect()`, `disconnect()`, `readWalletAccount()`, `isWalletAvailable()`, `onWalletStateChanged()`, `destroy()`. Wallet state is kept inside the closure; account-change events from the adapter drive reactive updates.
- `src/routes/index.tsx` (updated) — `useWalletState` hook subscribes to application state; `WalletPanel` renders disconnected/connecting/connected/error branches; "Try again" available for retryable errors.
- `src/application.test.ts` (updated) — 22 behavioral tests through the application interface: connect success, reject, EIP-1193 4001, unavailable, reconnect, account switch, disconnect, wallet-side disconnect, subscription cleanup, generic errors. Real-wallet smoke check documented in the test file header.

**Decisions:**
- `WalletAdapter` is the sole seam; production code and tests inject different implementations.
- Application never imports `window.ethereum` directly; `createBrowserWalletAdapter()` isolates that.
- State machine uses a discriminated union (`WalletState`) so the UI can exhaustively branch without casting.
- After disconnect, the account-change listener is detached so stale events cannot corrupt state.
- `createApplication()` without an adapter remains usable for read-only content.
