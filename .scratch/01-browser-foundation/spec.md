# Feature 01: Browser application foundation

Status: ready-for-agent

## Problem Statement

Users need a reliable browser entry point to interact with the DAO without an application backend. Contributors need a reproducible way to run and test that entry point before building independent product features.

## Solution

Scaffold a pnpm workspace with separate frontend and contracts/tooling packages. Provide a client-only application with wallet connection, explicit deployment/network context, and clear connection and transaction feedback. Establish local development and testing conventions that subsequent features extend rather than duplicate.

## User Stories

1. As a visitor, I want the application to load without connecting a wallet, so that I can explore public information.
2. As a wallet holder, I want to connect my supported wallet, so that I can act using my own account.
3. As a wallet holder, I want to see my connected address, so that I know which account will perform an action.
4. As a wallet holder, I want account changes reflected immediately, so that I do not accidentally act with a stale account.
5. As a wallet holder, I want to disconnect, so that the application stops treating my session as connected.
6. As a wallet holder, I want an explanation when my wallet is unavailable, so that I understand why I cannot connect.
7. As a wallet holder, I want rejected connection requests handled normally, so that I can retry without reloading.
8. As a user, I want to see the active network and DAO deployment, so that I can distinguish events and balances across deployments.
9. As a wallet holder, I want unsupported networks identified before submitting an action, so that I do not sign for the wrong deployment.
10. As a wallet holder, I want an offered network switch, so that I can reach the supported testnet conveniently.
11. As a user, I want loading and recoverable RPC errors explained, so that temporary failures are not mistaken for absent records.
12. As a contributor, I want repeatable local application and chain startup, so that I can develop without depending on testnet availability.
13. As a contributor, I want automated behavioral checks, so that later features can integrate without relying on manual testing alone.
14. As a contributor, I want pnpm workspace commands and a shared lockfile, so that installation and verification are consistent across packages.
15. As a frontend contributor, I want contract artifacts without importing deployment tooling, so that my browser bundle stays independent of Node-only dependencies and private credentials.
16. As a contract contributor, I want contract tests and deployment scripts owned by the contracts/tooling package, so that changes have a clear home and can be verified separately.

## Implementation Decisions

- Use pnpm exclusively for package installation and workspace orchestration, with a pinned package-manager version and a shared lockfile. Avoid parallel npm/yarn lockfiles.
- Scaffold a frontend workspace package and a contracts/tooling workspace package. The latter owns Solidity, Hardhat configuration, contract tests, deployment scripts, and maintenance scripts; the frontend owns browser behavior and presentation.
- Root workspace commands coordinate development, builds, tests, and applicable static checks. Each package also supports focused verification so contributors need not run unrelated tasks for every change.
- Define an explicit handoff for generated public ABIs and deployment information. Do not copy artifacts manually between contributors or import private keys, Node-only tooling, or deployment configuration containing secrets into the browser bundle.
- Add additional workspace packages only when an actual shared responsibility justifies them; the initial scaffold does not need a speculative package framework.
- Use TanStack Start in client-only mode, React, Tailwind CSS, TypeScript, and viem. There is no application server or server-only business logic.
- Target BNB Smart Chain testnet, with a configurable local chain for development and automated tests.
- Establish an application action/read interface as the primary testing seam. Keep wallet, RPC, and later IPFS dependencies at explicit external seams rather than adding interchangeable wrappers for every internal function.
- Deployment configuration identifies the chain, canonical DAO address, shared TestUSD address when deployed, and required RPC configuration. Do not infer event identity from proposal ID alone.
- Connection state follows wallet account and chain changes. Pending actions must not silently submit using obsolete account or network assumptions.
- Read-only features do not require a connected wallet. Wallet-dependent actions explain their requirements.
- Transaction feedback conventions distinguish wallet rejection, submitted transaction, confirmation, and failed transaction. Features add their concrete actions through the same conventions.
- Use Node.js development tooling, Hardhat for local EVM execution and contract testing, and Vitest for browser-facing TypeScript behavior. The exact browser runner is an implementation choice; do not introduce a backend to support it.
- A clean checkout must be runnable using documented commands and non-secret example configuration. Do not require committed private keys or shared service credentials.

## Testing Decisions

- Test external behavior through the application action/read interface and a small browser smoke path. Assert visible connection/network state, not React internals or library hook invocation counts.
- Test account switching, disconnect, rejected connections, unsupported networks, and RPC failures using controlled external adapters.
- Use a real local EVM for transaction-backed features as they arrive; do not substitute mocked contract outcomes for contract correctness.
- Validate a clean pnpm workspace installation, filtered package commands, root verification commands, and local-chain startup. Confirm contract artifacts can be consumed through the agreed handoff without importing deployment-only dependencies.
- Validate a production build does not rely on an application backend or leak configuration secrets.
- There is no existing implementation or test suite to reuse. This feature establishes the shared fixtures and conventions; subsequent features should extend them rather than invent separate harnesses.

## Out of Scope

- Treasury, proposal, voting, attendance, or proof business behavior.
- Production infrastructure provisioning, mainnet deployment, or automatic wallet creation.
- Universal support for wallet-signature recovery; supported signing behavior belongs to attendance credentials.
- Shared IPFS credentials or an application-operated backend.

## Further Notes

This is foundational work. Keep its deliverables runnable and observable; do not turn it into a broad abstraction framework. Later specs own their domain behavior and contribute their own local-chain fixtures.
