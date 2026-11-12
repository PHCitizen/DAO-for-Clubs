# Browser foundation map

## Notes

- [Spec](spec.md) spans three tickets; this session implements only issue 01.01.
- Integration branch: `integration/01-browser-foundation`.

## Decisions-so-far

- [01.01 resolved](issues/01-scaffold-pnpm-workspace.md#answer): pinned pnpm workspace
  with separate browser and Hardhat tooling packages. Ship only static client output;
  exchange committed, allowlisted public JSON instead of importing deployment tooling.
  Clean install, full checks, dev/static browser smoke, and real EVM startup verified.

## Fog

- [01.02](issues/02-connect-wallet-account.md) is unblocked: wallet connection/account lifecycle.
- [01.03](issues/03-validate-deployment-network.md) remains blocked by 01.02:
  deployment context, RPC configuration, and network validation.
