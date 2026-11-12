# Public contract artifact handoff

The frontend must not import Hardhat, deployment scripts, private signer
configuration, or raw Hardhat artifacts. It consumes a generated, committed JSON
file: `packages/frontend/src/generated/public-artifacts.json`.

## Ownership

Contracts/tooling owns:

- Solidity under `packages/contracts/contracts/`.
- Contract tests under `packages/contracts/test/`.
- Deployment and maintenance code under `packages/contracts/scripts/deploy/` and
  `scripts/maintenance/`.
- The non-secret source manifest `packages/contracts/deployments/public.json`.
- The exporter `packages/contracts/scripts/export-public-artifacts.ts` (run with `tsx`).

The initial manifest has local chain ID 31337, null DAO and TestUSD addresses,
and no ABI entries. Null means **not deployed**; never invent an address or
deploy a dummy domain contract just to populate the handoff.

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
4. Review and commit both the public source manifest and generated JSON.

The output contains only `chainId`, nullable addresses, and an `abis` object.
The exporter allowlists deployment fields and reads only the ABI from each
explicit artifact. Bytecode, build metadata, and arbitrary deployment fields
do not cross the boundary. It rejects invalid chain IDs, invalid addresses, and
artifact paths outside the artifact directory. Treat export inputs as trusted,
reviewed tooling files, not user uploads.

Frontend builds consume the committed output without compiling contracts or
executing the exporter. This keeps focused frontend work independent of
Node-only deployment dependencies. The application read seam currently consumes
the handoff to report the absence of a DAO; subsequent tickets add the network
and deployment action rules.

No signer secrets, authenticated RPC URLs, or service credentials belong in
either manifest. Public RPC configuration is a separate frontend concern; private
deployment RPC/signers must stay in ignored contracts-only configuration.
