# Public contract artifact handoff

The frontend must not import Hardhat, deployment scripts, private signer
configuration, or raw Hardhat artifacts. It consumes a generated, committed JSON
file: `packages/frontend/src/generated/public-artifacts.json`. This file and the
deployment manifest are gitignored local outputs, not committed artifacts.

## Ownership

Contracts/tooling owns:

- Solidity under `packages/contracts/contracts/`.
- Contract tests under `packages/contracts/test/`.
- Deployment and maintenance code under `packages/contracts/scripts/deploy/` and
  `scripts/maintenance/`.
- The non-secret source manifest `packages/contracts/deployments/public.json`.
- The exporter `packages/contracts/scripts/export-public-artifacts.ts` (run with `tsx`).

On a fresh checkout, start `pnpm dev:chain`, then run `pnpm deploy:local` in
another terminal before running the frontend or its tests/build/typecheck. This
builds contracts, creates the manifest for chain 31337, and exports the UI file.
Never invent an address or deploy a dummy domain contract just to populate the
handoff.

## Regenerate

After actual contract/deployment work:

1. Run `pnpm --filter @dao/contracts build`.
2. Have deployment tooling update the explicit public source manifest. Its fields
   are `chainId`, `daoAddress`, `testUsdAddress`, and `artifacts`.
   `artifacts` maps a public contract name to its JSON artifact path relative to
   `packages/contracts/artifacts/`, for example
   `"OrganizationDAO": "contracts/OrganizationDAO.sol/OrganizationDAO.json"`
   **once that contract actually exists**.
3. Run `pnpm artifacts:export` from the workspace root (or the same script
   filtered to `@dao/contracts`).
4. Keep both JSON outputs local; do not commit generated addresses or ABIs.

The output contains only `chainId`, nullable addresses, and an `abis` object.
The exporter allowlists deployment fields and reads only the ABI from each
explicit artifact. Bytecode, build metadata, and arbitrary deployment fields
do not cross the boundary. It rejects invalid chain IDs, invalid addresses, and
artifact paths outside the artifact directory. Treat export inputs as trusted,
reviewed tooling files, not user uploads.

Frontend builds consume the locally generated output without compiling contracts
or executing the exporter. Generate it explicitly before frontend work; rerun
deployment after restarting the local node or changing contracts. The frontend
still has no dependency on Node-only deployment tooling.

No signer secrets, authenticated RPC URLs, or service credentials belong in
either manifest. Public RPC configuration is a separate frontend concern; private
deployment RPC/signers must stay in ignored contracts-only configuration.
