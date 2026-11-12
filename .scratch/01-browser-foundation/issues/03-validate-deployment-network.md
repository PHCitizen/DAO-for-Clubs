# 03: Select and validate the deployment network

**ID:** 01.03
**Spec:** [Feature 01: Browser application foundation](../spec.md)
**What to build:** A user can identify the configured deployment, recognize a wrong wallet network, and safely switch to the supported chain before a deployment-specific action.
**Blocked by:** [01.02 — Connect and track the wallet account](02-connect-wallet-account.md).
**Status:** done

## Acceptance criteria

- [x] Display configured chain/deployment context and support BNB Smart Chain testnet plus a configurable local development chain.
- [x] Treat chain ID and canonical DAO address as deployment identity. Accommodate not-yet-deployed domain addresses without fabricating a live DAO.
- [x] Detect wallet network changes, explain mismatches, and offer a wallet-supported network switch with rejection/retry feedback.
- [x] Deployment-specific action preparation cannot silently use stale chain/account configuration or send to an unconfigured deployment.
- [x] Public reads do not require wallet connection; unavailable RPC/configuration is distinguished from an empty successful result.
- [x] Tests exercise supported/unsupported chains, successful/rejected switches, chain changes during preparation, absent deployment configuration, and RPC failure using controlled external adapters.

## Scope

Expose the shared network/deployment behavior that concrete domain actions will consume. Do not deploy the DAO or add business transactions in this ticket.

## Comments

### Implementation — 2026-11-13

**New files:**
- `packages/frontend/src/networks.ts` — Chain definitions (`BSC_TESTNET` chainId 97, `LOCAL_CHAIN` chainId 31337), `getSupportedChain()`, `isSupportedChain()`, `DeploymentConfig`, `resolveDeploymentContext()`.
- `packages/frontend/src/rpc.ts` — `RpcAdapter` interface, `createBrowserRpcAdapter()`, and domain error classes: `WalletNotConnectedError`, `DeploymentNotDeployedError`, `DeploymentNotConfiguredError`, `ChainMismatchError`, `StaleActionConfigurationError`, `RpcUnavailableError`.

**Extended files:**
- `packages/frontend/src/wallet.ts` — Added `getChainId()`, `onChainChanged()`, and `switchChain()` to `WalletAdapter`. Added domain error types `NetworkSwitchRejectedError`, `NetworkSwitchError`, `UnsupportedChainError`, and updated `normalizeWalletError()` and `createBrowserWalletAdapter()`.
- `packages/frontend/src/application.ts` — Added `NetworkState` discriminated union, `readDeployment()`, `readNetworkState()`, `onNetworkStateChanged()`, `switchNetwork()`, `prepareDeploymentAction()`, `queryPublicDeployment()`, and `queryPublicData()`. Reactive network tracking follows wallet events and clears on disconnect.
- `packages/frontend/src/routes/index.tsx` — Subscribes to `readNetworkState()` and `readDeployment()`, displays deployment context and public RPC status, explains network mismatches, and offers network switching with rejection/retry feedback.
- `packages/frontend/src/application.test.ts` — 45 behavioral tests exercising supported/unsupported chains, network matching/mismatch, reactive chain changes, switch rejection and retry, action preparation validation, staleness prevention mid-preparation, public reads without wallet, and distinguishing RPC failure from empty successful results. Real-wallet smoke check documented in the file header.

