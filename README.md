# DAO for Clubs

Client-only browser application and local EVM tooling. This scaffold intentionally
contains no domain contracts, wallet integration, or application backend.

## Prerequisites

- Node.js 24 LTS (tested with the version in `.node-version`; dependencies require
  at least Node 22.13).
- pnpm **12.18.0** (pinned in `package.json`). Activate that version with your
  Node/package-manager version manager before installing.

Use pnpm exclusively. Commit the single root `pnpm-lock.yaml`; do not add npm
or Yarn lockfiles.

## Start from a clean checkout

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>. The welcome page works without a wallet, running
chain, credentials, or environment file.

In another terminal, optionally start the real local EVM:

```sh
pnpm dev:chain
```

RPC: `http://127.0.0.1:8545`, chain ID: **31337**. The node is loopback-only and
state resets when restarted. Hardhat prints development accounts; these accounts
are public test fixtures, not secrets to reuse or fund on a public network.
No private keys are required by the deployment script.

### Deploy locally and configure the UI

With `pnpm dev:chain` running in another terminal:

```sh
pnpm deploy:local
pnpm dev
```

This builds and deploys TestUSD and the DAO, then updates the public manifest
and the frontend's generated addresses/ABIs. Open <http://localhost:3000/testusd>
and connect the node's first development account on chain 31337 to mint TestUSD.
That account is the currency administrator; treasury administration alone cannot
mint currency. No private key is stored in the frontend.

Rerun deployment after restarting the local chain, which clears its state.
Each deployment creates fresh contracts and replaces the UI's configured
addresses. Reload a running dev UI, or rebuild a production preview afterward.

## Verify

```sh
pnpm check                          # tests, builds, TypeScript checks
pnpm --filter @dao/frontend test
pnpm --filter @dao/frontend typecheck
pnpm --filter @dao/frontend build
pnpm --filter @dao/contracts test    # real EVM transfer test
pnpm --filter @dao/contracts build
pnpm --filter @dao/contracts typecheck
```

The first Hardhat build/test downloads the pinned Solidity compiler and therefore
needs internet access. Tests create isolated in-process EVMs and do not require
the separately running node.

Frontend behavior is tested through `src/application.ts`, the public action/read
seam used by the UI. Extend this seam for later wallet/network behavior, with
controlled adapters only at external wallet/RPC boundaries. Avoid tests against
React hooks or framework internals.

## Static production preview

```sh
pnpm build
pnpm --filter @dao/frontend preview
```

Open <http://localhost:4173>. This serves **only**
`packages/frontend/dist/client` using a static file server. Deploy that directory
to a static host; rewrite non-file paths to `/index.html` for client-side routing.
TanStack Start SPA mode generates the HTML shell at build time. Its intermediate
`dist/server` output is not a production service and must not be deployed.
There are no server functions or API routes.

## Clean-checkout smoke checklist

1. Run the clean install and `pnpm check` commands above.
2. Start `pnpm dev`; confirm “DAO for Clubs”, “Workspace ready”, and
   “No wallet required to get started” in a browser without a wallet extension.
3. Stop the dev server. Start the static production preview and confirm the same
   content, including after a page reload. No application server is needed.
4. Start `pnpm dev:chain`, then check the real node:

   ```sh
   curl -s http://127.0.0.1:8545 \
     -H 'Content-Type: application/json' \
     --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
   ```

   Expect `"result":"0x7a69"` (31337). `pnpm --filter @dao/contracts test`
   additionally mines a transaction and verifies its successful receipt.
5. Stop the preview and local chain with Ctrl-C.

For automated browser observation, install the optional
[agent-browser](https://github.com/vercel-labs/agent-browser) CLI and its Chrome
dependencies, then with either app server running:

```sh
SESSION="$(agent-browser session id --scope worktree --prefix scaffold)"
agent-browser --session "$SESSION" open http://127.0.0.1:4173
agent-browser --session "$SESSION" wait --text "Workspace ready"
agent-browser --session "$SESSION" snapshot
agent-browser --session "$SESSION" close
```

Use port 3000 instead for the dev smoke. Browser tooling is not required for
installation, builds, or behavioral tests.

## Ownership and configuration

- `packages/frontend`: TanStack Start SPA, React, Tailwind CSS, TypeScript,
  viem, and Vitest. No imports from the contracts package.
- `packages/contracts`: Solidity, Hardhat, contract tests, deployment scripts,
  maintenance scripts, and the public-artifact exporter.
- [Public artifact handoff](docs/public-artifacts.md): generated ABI/deployment
  JSON is the only cross-package browser input.

No environment configuration is needed for local deployment. Until deployment,
the public manifest may have null DAO/TestUSD addresses. Never put private
credentials in `VITE_*` variables: they are public browser build inputs. Keep
deployment credentials in ignored local configuration owned by contracts/tooling.
