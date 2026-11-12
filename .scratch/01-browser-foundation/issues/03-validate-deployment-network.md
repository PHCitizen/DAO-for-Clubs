# 03: Select and validate the deployment network

**ID:** 01.03
**Spec:** [Feature 01: Browser application foundation](../spec.md)
**What to build:** A user can identify the configured deployment, recognize a wrong wallet network, and safely switch to the supported chain before a deployment-specific action.
**Blocked by:** [01.02 — Connect and track the wallet account](02-connect-wallet-account.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Display configured chain/deployment context and support BNB Smart Chain testnet plus a configurable local development chain.
- [ ] Treat chain ID and canonical DAO address as deployment identity. Accommodate not-yet-deployed domain addresses without fabricating a live DAO.
- [ ] Detect wallet network changes, explain mismatches, and offer a wallet-supported network switch with rejection/retry feedback.
- [ ] Deployment-specific action preparation cannot silently use stale chain/account configuration or send to an unconfigured deployment.
- [ ] Public reads do not require wallet connection; unavailable RPC/configuration is distinguished from an empty successful result.
- [ ] Tests exercise supported/unsupported chains, successful/rejected switches, chain changes during preparation, absent deployment configuration, and RPC failure using controlled external adapters.

## Scope

Expose the shared network/deployment behavior that concrete domain actions will consume. Do not deploy the DAO or add business transactions in this ticket.
