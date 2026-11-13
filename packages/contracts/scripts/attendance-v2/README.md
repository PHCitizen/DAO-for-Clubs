# Attendance v2 proposal fixture

The evaluation fixture below remains isolated from production imports. The
[agreement](../../../../docs/attendance-format-v2-proposal.md) is now approved;
historical approval-pending statements below describe the original evaluation.
[Ticket 07.01](../../../../.scratch/07-attendance-publication/issues/01-prepare-attendance-set.md)
records the application integration. `export-browser-hash.ts` reproducibly
compiles this directory's `hash.nr` against the exact pinned clean upstream
Noir source and beta.26 compiler into `packages/frontend/src/attendanceHash.json`.
The frontend executes that arithmetic adapter with exact beta.26 NoirJS/ACVM
dependencies; it does not import the evaluation tree code or a proof runtime.

Reproduce the checked-in adapter after fetching the upstream/tool versions below:

```sh
POSEIDON_NOIR=/tmp/opencode/attendance-noir-poseidon NARGO=/tmp/opencode/attendance-bin/nargo pnpm --filter @dao/contracts exec tsx scripts/attendance-v2/export-browser-hash.ts
git diff --exit-code -- packages/frontend/src/attendanceHash.json
```

## What actually passed (2026-11-13)

- Local Hardhat EVM executes the unmodified, pinned Solidity compression, not a TS reimplementation. `Hash.sol` is compiled with solc 0.8.24, optimizer 200; runtime code is installed only in an isolated simulated EVM. No RPC, deployment transaction or credentials.
- `evaluate.ts` verifies 26 selected-mode outputs against pinned native Noir: zero/p−1 boundaries across domains plus the exact five-word context and recovery fold traces. **36 native Noir tests pass**: 26 hash vectors, five membership vectors (1/2/3/1023/1024), empty root, and four failing-witness controls. The earlier report's 14 raw permutation vectors remain prior evidence; these new tests specifically exercise the proposed **feed-forward mode**.
- Exact generated sets, roots and leaf-up paths are in `vectors.json`; `vectors.nr` holds independent Solidity-derived expected outputs for Noir. Inputs to larger sets deliberately include entry zero. TypeScript checks dedup/order invariance, rejection of 1,025 unique entries, noncanonical fields (`p`, uint256 max, bad case/width/whitespace), maximum uint256 limb splitting, altered high ID limbs/deployment, invalid paths and altered secret/context/sibling. It does not implement a production JSON validator or consumed-entry contract.
- ProveKit v1.0.2 compiles/prepares the **actual membership relation** without skipping underconstraint checks: **5,285 R1CS constraints, 5,507 witnesses**, 5,063 final ACIR opcodes. Prepared `.pkp` = 115,892 bytes; `.pkv` = 66,620 bytes.
- Chrome executes all 26 hash vectors, the empty-root construction and all five nonempty membership witnesses using beta.26 NoirJS/ACVM. Wrong secret/context/sibling/padding-index witnesses reject. Chrome generates and verifies an actual membership proof and rejects changed public context and tampered transcript. `browser-result.json` preserves the final observed result (one functional run: ~740 ms prove, ~142 ms verify, 761,848-byte JSON proof). A prior same-relation control also passed before adding the standalone Chrome hash/empty-root controls. This is **not** a cold/warm benchmark, 1-GiB memory measurement, download-budget result, unlinkability audit or soundness review.
- Strict fixture TypeScript check and repeat evaluation without `--write` pass. `pnpm --filter @dao/contracts typecheck` fails in unrelated frontend imports because `src/generated/public-artifacts.json` is missing. Attempting the normal build/export preparation compiled the three existing Solidity files but export is blocked by absent `packages/contracts/deployments/public.json`. No fake deployment metadata was added to hide that prerequisite.

Shared Codespaces Linux, Node 24.22.2, pnpm 12.18.0 (agent-browser invokes 12.16.1), repository tsx 4.23.15; Chrome for Testing 157.0.8103.78 (UA reduces to 157.0.0.0), two prover workers. Browser launches use the existing disposable agent-browser container configuration, including its default no-sandbox setting. Not hardened browser-deployment evidence.

## Reproduce the canonical vectors

From repository root, install the existing workspace lock with `pnpm install --frozen-lockfile`. Fetch isolated upstream checkouts and official tools (paths are overrideable with `POSEIDON_SOLIDITY`, `POSEIDON_NOIR`, `SOLC`, `NARGO`, `ATTENDANCE_WORK`):

```sh
git clone https://github.com/TaceoLabs/poseidon2-solidity /tmp/opencode/attendance-poseidon-solidity
git -C /tmp/opencode/attendance-poseidon-solidity checkout 4c599a08a45cd465a153d724425cee331c010df1
git clone https://github.com/TaceoLabs/noir-poseidon /tmp/opencode/attendance-noir-poseidon
git -C /tmp/opencode/attendance-noir-poseidon checkout 36c8db5a86795038822323dee790dd760372766d
mkdir -p /tmp/opencode/attendance-bin
curl -fsSL https://github.com/noir-lang/noir/releases/download/v1.0.0-beta.26/nargo-x86_64-unknown-linux-gnu.tar.gz -o /tmp/opencode/attendance-bin/nargo.tar.gz
tar -xzf /tmp/opencode/attendance-bin/nargo.tar.gz -C /tmp/opencode/attendance-bin
curl -fsSL 'https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v0.8.24+commit.e11b9ed9' -o /tmp/opencode/attendance-bin/solc
chmod +x /tmp/opencode/attendance-bin/solc
pnpm --filter @dao/contracts exec tsc -p scripts/attendance-v2/tsconfig.json
pnpm --filter @dao/contracts exec tsx scripts/attendance-v2/evaluate.ts
```

Verify the SHA-256 values below before using downloaded binaries. The evaluator verifies upstream HEAD/source cleanliness and compiler versions. Its default run compares newly executed Solidity outputs with the committed vectors/tests, runs native Noir tests and compiles the membership and hash-adapter circuits. Only deliberate vector updates use `--write`. Generated manifests and `Prover.toml` are deterministic and recreated under `ATTENDANCE_WORK`; source/vectors do not depend on temporary evidence surviving. A public, hardcoded test-only key signs the exact fixture message; no user's wallet or secret is requested.

## Minimal Chrome roundtrip

Reuse the exact-source **unmodified** ProveKit v1.0.2 build from [`private-browser-zk-qualification.md`](../../../../docs/research/private-browser-zk-qualification.md): source `4ee40639fb8849aeeba37761fdda07f28367e81d`, locked Cargo dependencies, beta.26 compiler, matching wasm-bindgen 0.2.113 and optimized web WASM. That report contains native/WASM build commands, toolchain pins and browser prerequisites. Do not replace it with the old SDK or a cryptographic patch. Existing artifacts were inspected and reused; no duplicate Rust build was necessary here.

The browser runtime directory (`ATTENDANCE_RUNTIME`, default `/tmp/opencode/private-zk-qualification`) is a separate pnpm fixture with exact `@noir-lang/noir_js=1.0.0-beta.26`, `@noir-lang/acvm_js=1.0.0-beta.26`, `esbuild=0.25.12`, and the original `tsx=4.21.0` (not used to run these repo scripts). Its previously qualified frozen lock has SHA-256 `1a80366c1d36b463668af0369a27a278e0521b687f352c28ba0c6436d9d65b00`. If recreating it, use those exact versions in an isolated pnpm workspace, approve only esbuild builds, install and retain the generated lock. This does not add prover dependencies to the frontend or root workspace. Browser source and server/bundling recipe are durable here; JS/WASM/key binaries are regenerated, not committed production artifacts.

```sh
# In /tmp/opencode/attendance-v2 (important: keys are written in cwd):
RAYON_NUM_THREADS=2 /tmp/opencode/private-zk-provekit/target/release/provekit-cli prepare .
# From repository root; keep this localhost server running:
pnpm --filter @dao/contracts exec tsx scripts/attendance-v2/browser-server.ts
# Separate terminal, after loading agent-browser's core skill:
pnpm dlx agent-browser@0.43.0 --session attendance-v2-005a3a02bd41 open http://127.0.0.1:4321
AGENT_BROWSER_DEFAULT_TIMEOUT=120000 pnpm dlx agent-browser@0.43.0 --session attendance-v2-005a3a02bd41 wait --fn "window.attendance && ['done','failed'].includes(window.attendance.stage)"
pnpm dlx agent-browser@0.43.0 --session attendance-v2-005a3a02bd41 get text '#result'
pnpm dlx agent-browser@0.43.0 --session attendance-v2-005a3a02bd41 close
```

Use your own worktree-specific browser session when reproducing. `browser-server.ts` verifies the source commit/runtime versions, bundles the pinned runtime separately, serves the correct web WASM files, applies COOP/COEP and the required generated `/pkg/` alias, and writes results to `$ATTENDANCE_WORK/browser-result.json`. No remote witness/proof service is used. The initial standalone server attempt found that pnpm does not expose the transitive `noirc_abi` at top level; it now resolves that dependency from NoirJS. The standalone hash adapter was moved to a sibling temporary package because Nargo discovered the enclosing membership package. Neither correction changed constraints or cryptography.

## Recorded SHA-256

```text
Nargo archive     64048040befd55a987158b11137d8f38f9688f696db4d84910dd1bcf0442fb80
solc binary       fb03a29a517452b9f12bcf459ef37d0a543765bb3bbc911e70a87d6a37c30d5f
ProveKit WASM     6709206363148b8fca2ee1959ec52900c0889dfd49b8f8e9a14e61182342531f
attendance_v2.pkp 1f02a055189fa6289c3186861a8711aeffda0ef295e8a7fa63fc4805b1add49e
attendance_v2.pkv e55cb70a6f947ee115b36f12e3a37320f3e5ec06a3d967e136fd71bd9ad1e93b
vectors.json      e4bf12dd1a4599aec9938daed1a9bde92c7bed00c3cdda3380f328ebf545f9db
```

## Still not approved

The proposed hash construction/domain parameters require explicit user approval; finite interoperability vectors are not a security audit. ProveKit's **three unresolved unused `FinalClaim` verifier warnings remain unresolved**, as do TODO-01's Chrome privacy/security/entropy and full budget qualification. Native↔Chrome interoperability remains a documented failure, not a Chrome-only publication prerequisite. This fixture does not test real-wallet recovery, a production public-claim contract, invalid-claim non-consumption, chain authentication, frontend JSON validation, or BSC gas/costs. Do those at their production feature seams after format approval. Preserve v1, immutable event versioning, entry consumption across proof upgrades, and the explicit secret-copying/front-running warnings.
