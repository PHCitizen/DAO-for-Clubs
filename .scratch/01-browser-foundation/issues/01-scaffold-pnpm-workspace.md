# 01: Scaffold and run the pnpm workspace

**ID:** 01.01
**Spec:** [Feature 01: Browser application foundation](../spec.md)
**What to build:** A contributor can install, run, build, and verify the initial browser application and local contract tooling through a reproducible pnpm workspace.
**Blocked by:** None (can start immediately).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Pin the pnpm version and establish one workspace lockfile, with separate frontend and contracts/tooling packages.
- [ ] The frontend starts and builds using TanStack Start in client-only mode, React, Tailwind CSS, and TypeScript, without requiring an application backend.
- [ ] The contracts/tooling package owns Solidity/Hardhat, contract tests, and deployment/maintenance scripts; a contributor can start a real local EVM through documented commands.
- [ ] Root commands coordinate installation, builds, tests, and applicable static checks; filtered commands support focused package work.
- [ ] Establish the public ABI/deployment-information handoff convention without importing Node-only tooling or private deployment credentials into the browser bundle. Do not implement future domain contracts in this ticket merely to populate it.
- [ ] A clean-checkout smoke check demonstrates the running application, production build, and local-chain startup; initial behavioral checks use the agreed application action/read seam rather than private framework internals.
- [ ] Document non-secret configuration and startup/verification commands. No additional package-manager lockfiles, committed private keys, speculative shared packages, or product backend are introduced.

## Scope

This is the greenfield bootstrap, not wallet integration or implementation of treasury, proposal, attendance, or proof behavior. Leave a runnable scaffold that later tickets extend.
