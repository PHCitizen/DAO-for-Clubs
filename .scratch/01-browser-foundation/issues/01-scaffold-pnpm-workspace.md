# 01: Scaffold and run the pnpm workspace

**ID:** 01.01
**Spec:** [Feature 01: Browser application foundation](../spec.md)
**What to build:** A contributor can install, run, build, and verify the initial browser application and local contract tooling through a reproducible pnpm workspace.
**Blocked by:** None (can start immediately).
**Status:** resolved

## Acceptance criteria

- [x] Pin the pnpm version and establish one workspace lockfile, with separate frontend and contracts/tooling packages.
- [x] The frontend starts and builds using TanStack Start in client-only mode, React, Tailwind CSS, and TypeScript, without requiring an application backend.
- [x] The contracts/tooling package owns Solidity/Hardhat, contract tests, and deployment/maintenance scripts; a contributor can start a real local EVM through documented commands.
- [x] Root commands coordinate installation, builds, tests, and applicable static checks; filtered commands support focused package work.
- [x] Establish the public ABI/deployment-information handoff convention without importing Node-only tooling or private deployment credentials into the browser bundle. Do not implement future domain contracts in this ticket merely to populate it.
- [x] A clean-checkout smoke check demonstrates the running application, production build, and local-chain startup; initial behavioral checks use the agreed application action/read seam rather than private framework internals.
- [x] Document non-secret configuration and startup/verification commands. No additional package-manager lockfiles, committed private keys, speculative shared packages, or product backend are introduced.

## Scope

This is the greenfield bootstrap, not wallet integration or implementation of treasury, proposal, attendance, or proof behavior. Leave a runnable scaffold that later tickets extend.

## Answer

Implemented on `integration/01-browser-foundation`:
- `f945b6e`: two-package pnpm workspace, TanStack Start SPA, Tailwind/React/TypeScript,
  public application read seam, real Hardhat EVM, and allowlisted public artifact export.
- `36ee59f`: pin an aged viem version so installation needs no release-age policy exception.

Contributor commands and non-secret setup are in `README.md`; public ABI/deployment
ownership and regeneration are in `docs/public-artifacts.md`. No domain contracts,
private keys, wallet integration, or application backend were introduced.

Verification:
- Fresh detached worktree at `36ee59f`, with no pre-existing node_modules:
  `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm artifacts:export`, and
  `git diff --exit-code` all passed.
- Vitest exercises the public application read interface without wallet/RPC.
- Hardhat mines a real transfer and checks the successful transaction receipt.
- Exporter integration test proves deployment-only fields and bytecode are excluded.
- Browser smoke via agent-browser passed for development and static production
  output in a clean worktree. Deleted `dist/server` before the static smoke to
  verify no runtime application server is needed.
- A separately started Hardhat node returned `0x7a69` (31337) via JSON-RPC.
- Standards/spec review performed serially (no subagent tool available); no
  unresolved findings for this ticket.

## Comments

- SPA prerender initially failed because localhost resolved to a different loopback
  address than its preview listener. Explicit `preview.host: '127.0.0.1'` fixes the
  build without disabling prerendering.
- Browser system dependencies were repaired during the session; browser smoke then
  passed. These optional tools are not required by `pnpm check`.
- Issue 01.02 is now unblocked; issues 01.02 and 01.03 remain out of this session's scope.
- Follow-up at user request: converted the exporter to TypeScript run with `tsx`,
  split it into named functions, and removed its script-specific test. Contracts
  tooling conventions are recorded in `AGENTS.md`. Script TypeScript checks and a
  direct export run pass; generated public output is unchanged. Application and
  real-EVM behavioral tests remain in place.
