# Browser foundation map

## Notes

- [Spec](spec.md) spans three tickets; this session implements only issue 01.01.
- Integration branch: `integration/01-browser-foundation`.

## Decisions-so-far

- [01.01 resolved](issues/01-scaffold-pnpm-workspace.md#answer): pinned pnpm workspace
  with separate browser and Hardhat tooling packages. Ship only static client output;
  exchange committed, allowlisted public JSON instead of importing deployment tooling.
  Clean install, full checks, dev/static browser smoke, and real EVM startup verified.
- [01.02 resolved](issues/02-connect-wallet-account.md): wallet connection, account tracking,
  reactive account switching, and disconnect lifecycle via controlled WalletAdapter seam.
- [01.03 resolved](issues/03-validate-deployment-network.md): deployment context for BSC testnet
  and local chain, network mismatch detection, wallet network switching with retry feedback,
  stale action preparation prevention, and public reads distinguishing RPC failure from empty results.

## Fog

None (all feature 01 tickets resolved).
