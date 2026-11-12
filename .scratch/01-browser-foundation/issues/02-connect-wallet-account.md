# 02: Connect and track the wallet account

**ID:** 01.02
**Spec:** [Feature 01: Browser application foundation](../spec.md)
**What to build:** A visitor can connect a supported wallet, see the active account, switch accounts, and disconnect without stale application session state.
**Blocked by:** [01.01 — Scaffold and run the pnpm workspace](01-scaffold-pnpm-workspace.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Offer a wallet connection action and display the active account after a successful connection.
- [ ] Wallet account changes and disconnects update application state; future action preparation cannot silently retain an obsolete account.
- [ ] Wallet absence, rejected connection, and recoverable connection errors have actionable feedback and allow retry without reloading.
- [ ] Read-only application content remains accessible without connecting a wallet.
- [ ] Use viem-compatible wallet interaction and never request a raw private key or introduce a hosted account backend.
- [ ] Behavioral tests cover connect, reject, switch account, disconnect, and reconnect through the application interface with a controlled wallet adapter; include a documented real-wallet smoke check.

## Scope

Network switching is a separate ticket. Attendance-signature reproducibility is not established by ordinary wallet connection.
