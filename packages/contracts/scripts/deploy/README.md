# Deployment scripts

Deployment scripts belong to this package, never the frontend. Keep signer credentials in local ignored configuration. After deployment, write an allowlisted public manifest and run `pnpm artifacts:export` as described in `docs/public-artifacts.md`.

## Local deployment

Start `pnpm dev:chain` in another terminal, then run `pnpm deploy:local` from
the workspace root. This builds the contracts, deploys shared TestUSD and the DAO,
updates `packages/contracts/deployments/public.json`, and exports the addresses
and ABIs to `packages/frontend/src/generated/public-artifacts.json` for the UI.

The node's first unlocked account is both the deployer and TestUSD currency
administrator. No private key or environment file is required. Connect that
account in your browser wallet on chain 31337 to mint at `/testusd`; use only
disposable development accounts. Deployment refuses non-loopback RPC URLs and
chain IDs other than 31337. `RPC_URL` can override the local deployment endpoint,
but the browser's default RPC remains `http://127.0.0.1:8545`.

Each run deploys fresh contracts, replacing the configured addresses. Restarting
the local node clears its state: rerun deployment afterward. Reload the dev UI
after deployment; rebuild it if using a production preview.
