# Transparent attendance proofs: feasibility investigation

Date: 2026-11-13. Scope: TODO-01 research only; **not a cryptographic format agreement, implementation authorization, or benchmark completion**.

## Subsequent requirement revision

After this initial report, the user approved replacing credential hashing as
well as Merkle/nullifier hashing in a new credential version, accepting
regenerated QR entries. SHA-256 preservation statements below are historical
assumptions of this first pass, not constraints on the proposed v2 investigation.
Existing v1 semantics remain frozen. Follow-up research must select a matched
prover/hash configuration (Poseidon2 is a candidate, not an approved format),
revisit candidate rankings and circuit costs, and specify version transition
and duplicate-claim safeguards. No measured results or format approvals follow
from this change. See `todos/01-transparent-zk-feasibility.md`.

## Decision summary

**No examined candidate is demonstrated to meet the complete requirement today.** This is an evidence gap, not a proof of impossibility. Do not unblock production-format features 07–09 from this report. There are real transparent provers and real direct EVM STARK verifiers, but their existence separately does not establish a browser-proving, zero-knowledge, affordable BSC pipeline.

Recommended next action: a separately authorized, time-boxed feasibility benchmark, starting with a direct STARK route and stopping early on missing ZK or browser support. Treat Stone + its direct EVM verifier as a native interoperability control, not the browser solution. Investigate Stwo's exact ZK-capable browser configuration and matching direct Solidity verifier before investing in an attendance AIR. Keep Binius64 as a SHA-256-friendly alternative, but its examined EVM port reports prohibitive full-strength verification gas. Do not rescue any failing candidate with Groth16 or KZG.

The acceptance workload is **one credential's membership in a set of 1,024 credentials**, not proving 1,024 independent credential claims. Both private and public modes must complete witness preparation and all proving/wrapping in Chrome and Firefox desktop within 60 seconds, use at most 1 GiB peak memory, and require at most 50 MiB of proving artifacts. These are user targets, **not measured results**. Cost ceiling, security target, supported machines, and final cryptographic format require user approval after measurements.

## Repository requirements and statement

Read: root `AGENTS.md`, `docs/agents/domain.md`, root `GLOSSARY.md`, `todos/01-transparent-zk-feasibility.md`, `docs/attendance-credentials.md`, and `.scratch/07-attendance-publication/spec.md`, `.scratch/08-private-attendance-proofs/spec.md`, `.scratch/09-public-attendance-claims/spec.md`. `GLOSSARY-MAP.md` and applicable ADR files were absent at inspection.

`docs/attendance-credentials.md` is authoritative, including over older proposals:

```text
secret = SHA256(abi.encode(bytes signature, uint256 proposalId))
entry  = SHA256(abi.encode(uint256 proposalId, bytes32 secret))
```

Keep the exact 65-byte wallet signature and frozen EIP-191 message/QR semantics. No Poseidon replacement of either derivation is authorized. Credential recovery remains off-circuit: the statement needs knowledge of `secret`, not proof of ECDSA identity or signature verification. This is consistent with transferable organizer-attested credentials. A holder who knows that secret can present it regardless of how they acquired it.

Proposed *benchmark relation*, not a wire-format decision:

- Private witnesses: 32-byte secret, derived entry, hidden leaf position, siblings/path. Constrain entry derivation and membership, rather than trusting an entry computed outside the circuit.
- Public context: chain ID, DAO deployment address, event/proposal ID, authenticated finalized root, statement/format version. Bind every context field into the proof relation/transcript and verifier's expected statement; an ignored public input is not binding.
- Public-claim mode additionally binds recipient and a deterministic nullifier derived **inside the relation** from secret plus event/deployment domain. A possible benchmark hypothesis is a domain-separated SHA-256 construction over secret, chain, DAO and proposal. It must be independent of recipient, prover randomness, and ideally root/version migrations, so changing those cannot mint another claim. Exact serialization/hash is pending review. Changing a proof version must not silently create a fresh nullifier namespace.
- Private mode exposes **neither entry/leaf index nor public-claim nullifier**. Use genuinely ZK masking and fresh cryptographic randomness for every new presentation. Different proof bytes alone do not establish unlinkability. Public event/root association and forwarding the same proof file remain visible/permitted; transport fingerprints are not solved by ZK.
- Contract compares context to `block.chainid`, its configured DAO/event/root/version and recipient to the permitted sender (no relayer workflow specified), then verifies and atomically consumes the nullifier. A copied proof cannot claim for a different wallet. Invalid proof or revert must not consume it.
- Private verifier reads the root from the configured chain/DAO. An attendee-supplied root/key/file cannot authenticate itself; distinguish RPC failure, missing root, unsupported configuration and invalid proof.

**Pin approved verification configurations, not user keys.** A configuration identifies the reviewed program/circuit/AIR, public-input layout, protocol and security parameters, hashes, ZK mode, artifact digests, verifier bytecode/address and dependencies. Proof files may select only an allowlisted ID. Do not accept arbitrary embedded verification keys, programs, FRI parameters or recursion verifier identities. Transparent preprocessing may produce public constants/verification artifacts; that is not a ceremony if reproducible without a hidden trapdoor. Audit that property at *every* recursion/compression step.

## Candidate comparison: documented facts versus missing evidence

Primary sources were read directly. “Not established” means this investigation did not find/validate the complete integration; it does not claim no implementation exists anywhere.

| Candidate and actual route | Primary-source facts | Attendance feasibility / blockers |
| --- | --- | --- |
| **Stone/Cairo → direct StarkWare EVM verifier**, optionally split by STARK-EVM adapter | Stone documents Linux-only support, Cairo/CairoZero execution traces and native prover/verifier commands. StarkEx publishes Solidity STARK/FRI verification, not a pairing wrapper. Adapter provides actual split-proof submission against an Ethereum verifier. [S1–S3] | Strong native EVM interoperability control; **not a documented browser prover**. Porting C++/runner/annotation/splitting to browser is substantial work. Establish actual witness privacy/ZK mode; computational integrity is not automatically a private attendance presentation. Deployment on Ethereum does not establish a BSC deployment or gas fit. |
| **Stwo → matching direct EVM verifier** | Stwo documents Rust Circle STARKs over M31, WASM SIMD paths, optional Rayon parallelism and Keccak channel, plus production use in SHARP. It says downstream on-chain verifiers require faithful implementation; test defaults are not production security levels. [S4] | Best modern STARK investigation lead, **not an approved end-to-end stack**. Need matching prover/serialization/Solidity implementation, ZK masking evidence, actual SHA-256 attendance constraints and browser round trip. SHARP is a service, not acceptable browser-local proving evidence. A small `no_std` Rust verifier is not itself a Solidity deployment. README points to a migrated `proving` repository; attempted public fetch returned 404, so migration/toolchain availability is an explicit blocker. |
| **Binius64 → direct Binius Solidity port** | Upstream has word-oriented circuits and an actual fixed/variable SHA-256 gadget. The port publishes a real randomized ZK Keccak-preimage proof with full-strength verification and deployment-bound constants; it reports **2,478,522,559 gas** on Anvil for its 232-query example. Tests deliberately raise gas limits, and some simulator tests use subsets/split work. [S5–S7] | Real direct-verification candidate, but **not BSC-ready evidence**. That upstream-reported number is for a different circuit and not our measurement; nevertheless it is a severe warning. The port is third-party relative to Binius, and its own source/claims need independent audit. WASM field code is not a complete browser proving product; browser/threading support, 1 GiB memory, and attendance circuit support remain unproven. Don't benchmark a reduced-query test as production success. |
| **Nova/Spartan with Pedersen + IPA → matching Solidity verifier** | Nova supports Pedersen/IPA as well as HyperKZG/Mercury; the latter two explicitly require powers-of-tau. Nova describes ZK random-instance folding before compression and provides SHA-256 circuit examples. Lurk's Solidity repo contains primitive tests and evolving feature branches with compatibility/work remaining. [S8–S9] | Transparent elliptic-curve option worth retaining only with an exact, matched IPA compression/verifier configuration. No demonstrated browser attendance + BSC pipeline here. Avoid assuming that “Nova” means every compression backend is setup-free, or that old Arecibo verifier branches interoperate with current Microsoft Nova. Curve/DLOG and generator-derivation assumptions differ from hash-based STARKs; not post-quantum. |
| **PIL-STARK / Plonky2 / Winterfell / Miden building blocks** | PIL-STARK provides JS STARK proving and Circom verifier generation; examples use Node filesystem tooling and large heap allowances. Plonky2 is deprecated/archived and documents roughly 100-bit conjectured defaults, with a Poseidon caveat. Winterfell explicitly supports WASM but warns it does not provide perfect ZK and may leak secret-input information. Miden documents WASM/no-std and native STARK proving. [S10–S13] | Not turnkey shared browser/BSC solutions. PIL's generated **BN128 Circom circuit is not yet an on-chain transparent verifier**; adding Groth16/PLONK would break the rule. Winterfell cannot be accepted for privacy on the basis of STARK branding. Miden's WASM claims do not establish a matching direct Solidity verifier or full witness privacy for this statement. Custom verifier/AIR work increases maintenance and audit ownership. |

### Explicit exclusions: transparent core, nontransparent wrapper

- `snarkjs` genuinely supports browser WASM proving and Solidity verifier generation, but Groth16 requires circuit-specific setup and PLONK/FFLONK still require universal powers-of-tau. A public/updatable ceremony is **still trusted setup**. Circom + SHA-256 + snarkjs is therefore not an eligible fallback. [S14]
- RISC Zero documents STARK-based zkVM execution, but its Ethereum integration identifies its on-chain verifier as the **Groth16** verifier. That standard route fails the no-wrapper-setup rule. A hypothetical direct STARK verifier/browser prover must be evaluated as a different complete configuration, not credited from the Groth16 integration. [S15]
- Noir is a frontend designed for ACIR-compatible backends, not an assurance about setup. Its convenient browser tooling does not make any chosen KZG backend transparent. Selection must name the actual commitment scheme and EVM wrapper rather than a circuit language. [S16]

## SHA-256 circuit work and tree hypotheses

The required `entry` preimage is exactly 64 bytes: big-endian 32-byte `proposalId` followed by the secret. Standard SHA-256 padding makes this **two compression blocks**, not one. Browser WebCrypto computes a host hash; it does **not** constrain a private preimage inside a proof. The circuit/AIR must implement SHA-256 rotations, XOR, Boolean functions, 32-bit modular additions, byte order and padding, or use a proved VM accelerator with all obligations verified. Binius's actual gadget is an example, including its documented 32-bit input-word preconditions; do not assume the caller's range restrictions are automatic. [S6]

The outer `secret` derivation need not be repeated in the attendance circuit: it is recovery, not membership. If experimentally included, `abi.encode(bytes65,uint256)` has offset/length/padding and is **192 bytes**, not concatenation of 65+32 bytes. Keep host vectors exact; never replace ABI encoding with packed encoding or normalize `v`. These byte-count observations follow from the frozen credential spec and Solidity ABI rules. [S17]

Benchmark at least two tree hypotheses while preserving those derivations:

1. Domain-separated SHA-256 leaves/nodes: simple standard hash semantics but multiple SHA compressions per level. A depth-10 membership path is ten hashes, not all 1,024 leaves in-circuit; full reconstruction/validation of public data happens during host witness preparation and still counts toward complete preparation cost.
2. A reviewed proof-friendly hash (e.g. the selected backend's precise Poseidon/Poseidon2 instance) for Merkle structure only, with lossless limb encoding of the SHA-256 entry. This may reduce constraint cost but introduces hash/field/security choices and cross-runtime implementation work. Never reduce a 256-bit entry modulo a small field and call it lossless. Bind leaf versus internal-node domains, lengths, arity and limb order.

Neither hypothesis is approved. Before agreement, explicitly compare bytewise leaf sorting, deduplication, left/right path bits versus sorted pairs, odd-leaf duplication versus empty-padding, empty-set publication semantics, singleton behavior, maximum 1,024 limit and overflow rejection, path encoding, root representation and non-power-of-two sizes. Use sizes 0, 1, 2, 3, 1,023, 1,024 and rejected 1,025. Empty sets cannot yield membership. Domain-separated padding must not invent a credential someone can claim. Make all host/prover/verifier versions use the same eventual vectors.

## Benchmark plan (future work; commands are not completed results)

### Gate A — exact configuration and reproducible build

Before heavy installs or custom circuits, obtain a maintainer-supported browser proving example with documented ZK mode and a matching direct EVM verifier. Trace commitments/Fiat–Shamir/recursion end-to-end. If this cannot be identified, record the blocker and stop that lane rather than writing a one-off verifier. Get security review of masking, fresh CSPRNG use, generator derivation (if IPA), FRI/grinding parameters, and whether a transparent outer proof actually hides an inner witness/proof. Do not lower security to hit performance targets.

Starting source snapshots inspected (research references, **not approved verification configurations**):

| Lane | Exact source revision / dependencies to resolve |
| --- | --- |
| Stone control | `starkware-libs/stone-prover@1414a545e4fb38a85391289abe91dd4467d268e1`; `starkware-libs/starkex-contracts@f3b250690c5d927a6e398e9c1735d9193a643034`; adapter `e044116e3cf4e3cbca11cce7b9e508a0f3e6870b` (README advertises crate `0.1.3`). Stone's CairoZero example specifies `cairo-lang==0.13.2`; its Dockerfile owns native dependencies. Contract source uses Solidity `^0.6.12`; choose and record an exact compiler, optimizer and EVM target. These repositories are **not established to be mutually compatible at those heads**; first reproduce the adapter's pinned example, then derive a matched lock manifest. [S1–S3] |
| Stwo exploration | `starkware-libs/stwo@826591c6c371376810ca8213b5812d5daf6d5092`; toolchain file pins `nightly-2026-01-15`; README shows `stwo` 2.2 with `prover` and optional `parallel`. Resolve the migrated source, ZK frontend and exact Solidity verifier before claiming a runnable lane. [S4] |
| Binius exploration | `IrreducibleOSS/binius64@138ab7180fe3dfec59381dc7e8966a1829a0a35b`; its current toolchain file says `1.98.1`. Solidity port `hooperben/binius-solidity-verifier@a35be145abfb81ac41ed6a411ed8d7fad5e1cba1` describes vectors from an instrumented upstream using Rust 1.95. **This version mismatch is unresolved**; follow the port's vector provenance, not an arbitrary newer upstream. [S5–S7] |
| IPA alternative | `microsoft/Nova@01b1e2d662a847ed7029770ecbaf6687398899dd` is documentation context; Lurk verifier `grumpkin@3fd2d46d4d25f64d36db2a67d3f4d10a37d30db4` is an older integration reference, not a compatible pairing. Resolve exact Arecibo/Nova commit, IPA scheme, circuit adapter, randomness and Solidity implementation first. [S8–S9] |

Preserve upstream Cargo/pnpm lockfiles; record SHA-256 of source archives, compiler binaries, wasm-bindgen/wasm-pack, WASM and verifier artifacts. Use `wasm32-unknown-unknown` with explicit JS bindings/worker harness, not WASI/server execution presented as browser proving. Any Rayon WASM thread bridge and nightly/build-std flags must be pinned and proven to build. Native `target-cpu=native` commands are controls only, not browser build commands.

Repository orchestration should remain pnpm workspace + TypeScript `tsx` scripts in the contracts/tooling ownership area; deployment keys stay out of frontend. Rust/C++ proof libraries are dependencies, not a reason to move deployment tooling into the browser. No benchmark script or additional package was created in this research pass.

### Gate B — real statement and negative tests

Build only an isolated feasibility fixture after separate authorization. Produce shared vectors from existing credential tests; validate native/WASM/circuit agreement before measuring. Exercise private and public modes with the same secret and hidden path. Include wrong secret, wrong sibling/index, missing credential, altered chain/DAO/event/root/version/recipient, arbitrary/nullifier mutation, malformed or noncanonical field/byte encodings, truncated/oversized proofs, unapproved configuration and verifier keys, copied proof from another sender, repeated claim from another recipient, and cross-deployment replay. Ensure public claims do not revoke private presentations.

Generate several fresh private proofs for the same credential and different credentials. Inspect public inputs, journals, recursion inputs, proof files and logs for entry/path/signature/nullifier leakage. Require construction-level ZK justification and implementation review, not just entropy/difference tests. Trace queries and deterministic commitments can expose witness information even when secrets are absent from JSON.

### Gate C — actual Chrome and Firefox measurements

Use a named baseline desktop/laptop with OS, CPU, RAM, power mode, browser exact versions, worker count and browser flags recorded; benchmark both browsers, not Chromium substituted for Firefox. First prove/verify with a network audit confirming no proving service or secret upload. Serve artifacts statically over HTTPS or localhost. Multi-threaded shared WASM memory requires a secure, cross-origin-isolated context; set and test COOP/COEP and compatible artifact CORS/CORP headers. Check wallet/IPFS integration under these headers. [S18]

Record at least five cold and ten warm runs per browser/mode/tree option, including failures. Start the complete-local-operation timer before dataset parsing/root validation, path reconstruction, worker/WASM initialization and witness generation; end after every proof/compression step and proof export is ready. Report separate download/RPC times as well as cold end-to-end time; don't hide artifact initialization or witness work in a warmup. Obtain the user's agreement on whether the 60-second acceptance includes network fetch latency; report both until then. Report median, maximum and distribution, not only the best run.

Count **all** proving artifacts (JS/WASM, circuits/AIR/program, public constants/proving data, recursion and wrapper data), both transfer-compressed and uncompressed bytes. Use the conservative uncompressed total for the 50 MiB gate pending clarification. Report proof size separately; small output proofs do not imply small downloads.

Measure aggregate peak prover footprint including WASM linear memory, JS buffers, worker copies/stacks and native browser allocations. Record per-worker linear-memory maxima and OS process-group/isolated browser cgroup peak, with idle baseline and raw peak. JS heap alone and Chrome-only memory APIs are insufficient; use an OS measurement method applicable to Firefox too. Treat unknown memory as unknown, not a pass. Single-thread fallback gets its own results; a faster native run cannot substitute.

### Gate D — actual BSC verification and cost approval

BSC testnet is chain ID **97**, not opBNB. [S19] Use a current authenticated RPC configuration and record chain ID, block number/hash, hardfork/client configuration, block gas limit, gas price and provider transaction/calldata caps from the actual measurement. Do not import Ethereum verifier addresses as BSC deployments.

Deploy the exact verifier and dependencies to a BSC-compatible local chain/fork first, using production gas/code-size rules (no unlimited contract size, raised block limits or reduced query count). Measure creation/initcode/runtime bytes for every contract, linked-library calls, complete calldata including ABI overhead, estimation and actual receipt gas for valid and invalid proofs, plus the full DAO claim's storage/events overhead. For split verification, measure *every* transaction, preparation/fact registry costs, persistent state and final claim; prove intermediate facts cannot be substituted or replayed across statements. A multi-transaction design is a product/architecture decision needing approval, not an invisible optimization.

Only then, with explicit deployment authorization/funded test account, send a valid and negative-test claim on BSC testnet and retain receipts. `eth_call` success with an inflated gas cap is not evidence of transaction inclusion. Capture failure reasons if it exceeds real limits. Convert total gas to tBNB at the recorded price, show a range for price variation, and ask the user to approve the cost ceiling; **none is approved here**.

Upstream smoke commands (after an explicitly authorized installation, in their matched source checkout) are useful controls, not attendance benchmarks:

```sh
# Stwo native control, not browser/attendance evidence
cargo test --release --features prover --package stwo-examples
# Stone native control: use the exact files produced by its documented Cairo runner
cpu_air_prover --out_file=proof.json --private_input_file=private.json --public_input_file=public.json --prover_config_file=prover_config.json --parameter_file=params.json
cpu_air_verifier --in_file=proof.json
# Binius EVM port upstream suite; inspect its raised limits before interpreting results
pnpm install --frozen-lockfile
pnpm compile
pnpm test
```

There is deliberately **no purported reproducible attendance benchmark command** yet: the compatible browser/ZK/verifier configuration and fixture do not exist in this repository. A follow-up must supply a checked-in manifest, exact commands and raw results before concluding TODO-01. Inventing commands for a nonexistent harness would obscure this blocker.

## Evidence actually measured in this pass

Safe PATH/version checks only: Node `v24.22.2`, pnpm `12.18.0`; `rustc`, `cargo`, `wasm-pack`, standalone `solc`, `google-chrome`, and `firefox` were not on PATH. This does not establish absence of packaged browsers or repository-managed compilers. No heavy dependencies installed; no proofs produced; no browser performance, memory, artifact-size, gas, deployment or BSC transactions measured. The Binius gas figure above is its author's report, **not independently reproduced**.

| Required result | This investigation |
| --- | --- |
| Chrome/Firefox complete 1,024-set membership proof ≤60 s | Unmeasured |
| Aggregate peak memory ≤1 GiB | Unmeasured |
| Complete proving artifacts ≤50 MiB | Unmeasured |
| Fresh-private-proof unlinkability of actual implementation | Unestablished |
| Direct transparent BSC public claim, real constraints and cost | Unmeasured |
| Approved immutable format/security configuration/cost ceiling | Not selected |
| Real-wallet deterministic recovery | Separate gate; unexecuted per authoritative credential documentation |

## Readiness and maintenance impact

No production publication/proof ticket is unblocked. Research unblocks a **benchmark task definition**, compatibility/source investigation, and a separate security review. After measured passes and explicit user format/cost approval, feature 07 canonical tree/publication, feature 08 browser/private verification and feature 09 constrained public claims can share the same versioned configuration/vectors. They must not each invent their own proof interface.

The principal maintenance trade-off is accepting an upstream-supported complete pipeline versus owning a browser port, SHA AIR, proof serializer, direct Solidity verifier and their audits. A custom verifier is a new security subsystem, not a small frontend dependency. Prefer stopping with “requirements not yet validated” over committing a format to amortize speculative implementation work. Real-wallet recovery remains an independent manual readiness check even if cryptographic benchmarks pass; proof feasibility cannot validate wallet signature reproducibility.

## Primary sources

URLs below are official projects' docs/source, except the EVM adapter/ports, which are their implementers' own primary source (not endorsements by the underlying proof-system projects). Snapshot SHAs above permit stable follow-up inspection; mutable documentation was read on the report date.

- **S1:** [Stone source and native instructions](https://github.com/starkware-libs/stone-prover/blob/1414a545e4fb38a85391289abe91dd4467d268e1/README.md). Explicitly warns its native verifier does not authenticate the program/public input on its own.
- **S2:** [StarkEx verifier source](https://github.com/starkware-libs/starkex-contracts/blob/f3b250690c5d927a6e398e9c1735d9193a643034/evm-verifier/solidity/contracts/StarkVerifier.sol). FRI/grinding validation and direct verification code.
- **S3:** [STARK-EVM adapter instructions](https://github.com/zksecurity/stark-evm-adapter/blob/e044116e3cf4e3cbca11cce7b9e508a0f3e6870b/README.md). Native annotation/split flow and warning that example targets an older Ethereum verifier.
- **S4:** [Stwo README](https://github.com/starkware-libs/stwo/blob/826591c6c371376810ca8213b5812d5daf6d5092/README.md), [toolchain](https://github.com/starkware-libs/stwo/blob/826591c6c371376810ca8213b5812d5daf6d5092/rust-toolchain.toml).
- **S5:** [Binius64 source README](https://github.com/IrreducibleOSS/binius64/blob/138ab7180fe3dfec59381dc7e8966a1829a0a35b/README.md), [toolchain](https://github.com/IrreducibleOSS/binius64/blob/138ab7180fe3dfec59381dc7e8966a1829a0a35b/rust-toolchain.toml).
- **S6:** [Actual Binius SHA-256 circuit, preconditions and tests](https://github.com/IrreducibleOSS/binius64/blob/138ab7180fe3dfec59381dc7e8966a1829a0a35b/crates/circuits/src/sha256/mod.rs).
- **S7:** [Binius Solidity port's own status, benchmark and caveats](https://github.com/hooperben/binius-solidity-verifier/blob/a35be145abfb81ac41ed6a411ed8d7fad5e1cba1/README.md).
- **S8:** [Microsoft Nova commitment schemes, ZK and setup distinctions](https://github.com/microsoft/Nova/blob/01b1e2d662a847ed7029770ecbaf6687398899dd/README.md).
- **S9:** [Lurk Solidity verifier integration status](https://github.com/lurk-lab/solidity-verifier), [exact inspected Grumpkin branch snapshot](https://github.com/lurk-lab/solidity-verifier/blob/3fd2d46d4d25f64d36db2a67d3f4d10a37d30db4/README.md).
- **S10:** [PIL-STARK package, scripts and dependencies](https://github.com/0xPolygon/pil-stark/blob/51ee688ca1c56efe4c253a2f9f89cb1549a1a2cb/package.json), [README disclaimer](https://github.com/0xPolygon/pil-stark/blob/51ee688ca1c56efe4c253a2f9f89cb1549a1a2cb/README.md).
- **S11:** [Plonky2 deprecation, setup-independent FRI construction and security caveats](https://github.com/0xPolygonZero/plonky2).
- **S12:** [Winterfell WASM and privacy warnings](https://github.com/facebook/winterfell/blob/2f78ee9bf667a561bdfcdfa68668d0f9b18b8315/README.md).
- **S13:** [Miden VM execution/platform and benchmark documentation](https://github.com/0xMiden/miden-vm). Native example numbers are not browser attendance results.
- **S14:** [snarkjs protocols, browser support and ceremonies](https://github.com/iden3/snarkjs/blob/master/README.md).
- **S15:** [RISC Zero proof layers](https://github.com/risc0/risc0/blob/main/README.md), [Ethereum integration's Groth16 verifier](https://github.com/risc0/risc0-ethereum/blob/main/README.md).
- **S16:** [Noir backend-agnostic frontend description](https://github.com/noir-lang/noir/blob/master/README.md).
- **S17:** [Solidity ABI formal specification](https://docs.soliditylang.org/en/latest/abi-spec.html#formal-specification-of-the-encoding).
- **S18:** [Mozilla SharedArrayBuffer and shared WASM memory requirements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements).
- **S19:** [BNB Chain official BSC wallet/network configuration](https://docs.bnbchain.org/bnb-smart-chain/developers/wallet-configuration/).
