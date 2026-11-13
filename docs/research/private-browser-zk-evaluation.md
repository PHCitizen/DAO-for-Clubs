# Private browser ZK after public-claim simplification

Date: 2026-11-13. Research and isolated controls only; **no production format or proof configuration approved**.

## Decision

**Prefer Noir → ProveKit's base Spartan/WHIR ZK proof → local WASM verification for the next qualification attempt. Do not select it for production yet.** A real transparent, non-KZG Noir backend exists. However, the current ProveKit documentation explicitly records a v1.0.2 WASM/CLI cross-verification failure and withdraws its former JavaScript recipe. It is not presently evidence of a complete supported browser stack. [1–4]

The concrete candidate tuple is:

- `worldfnd/provekit` **v1.0.2**, annotated tag object `8431676666a4b9fe85edec54dfa4df990ebc0175`, peeled source commit **`4ee40639fb8849aeeba37761fdda07f28367e81d`**; retain its `Cargo.lock`.
- Its pinned Rust **`nightly-2026-03-04`**, Noir **`1.0.0-beta.26`**, and same-version NoirJS/ACVM witness generation; direct `tooling/provekit-wasm` bindings from that source, not a mismatched older SDK.
- Base proof only: **no gnark, Groth16, recursive wrapper, HTTP verifier, remote prover, or KZG**.
- Evaluate the pure-Noir **TACEO BN254 Poseidon2 width-4 permutation**, `noir-poseidon@v0.6.2` / **`36c8db5a86795038822323dee790dd760372766d`**, as the common application-hash primitive. Evaluate ordinary Solidity hashing with `TaceoLabs/poseidon2-solidity@`**`4c599a08a45cd465a153d724425cee331c010df1`**. This is a candidate pairing, **not demonstrated cross-runtime equivalence or an approved hash mode**. [5–6]

**Fallback research lane:** Plonky3's explicit hiding-FRI + hiding-Merkle + ZK uni-STARK configuration. Three existing native positive/negative tests actually passed below. It is a maintained cryptographic toolkit, not a turnkey browser application; choosing it means owning an attendance AIR, witness builder, WASM bindings, serialization and security configuration. That maintenance burden ranks it below a repaired, upstream-supported ProveKit browser integration. Do not start that custom subsystem merely because its arithmetic control passes. [7–9]

No examined configuration has yet demonstrated all of: genuine witness ZK, browser-local prove/verify, depth-10 attendance, Chrome and Firefox, ≤60 seconds, ≤1 GiB aggregate peak memory, and ≤50 MiB total proving artifacts. **This is an explicit qualification gap, not a finding of mathematical infeasibility.** No production publication/proof ticket is unblocked.

## Scope and invariants

Read `AGENTS.md`, `docs/agents/domain.md`, `GLOSSARY.md`, `project.md`, `todos/01-transparent-zk-feasibility.md`, `.scratch/08-private-attendance-proofs/spec.md`, and the three existing research reports. The current user revision overrides their historical on-chain ZK/nullifier gates:

- **Private:** prove knowledge of a secret deriving an entry in an organizer's immutable attendance root. Hide secret, entry, leaf index and path. Fetch/authenticate the root from the configured chain/DAO/event. Fresh presentations expose no stable credential identifier. No backend or setup ceremony.
- **Public:** disclose secret and path; contract derives the entry, performs ordinary membership hashing, records the sender and atomically consumes that entry in event/deployment scope. No ZK or private-claim nullifier is needed. Invalid claims consume nothing. Credential copying for private proofs and first-public-claim front-running are accepted weaknesses, not bugs to solve with extra cryptography.
- **Versioning:** v1 derivations stay frozen. v2 may change secret/entry/tree hashing and regenerate QRs. Use one immutable credential version per finalized event; reject dual-root/version paths that allow another public claim. Proof-format upgrades must not reset entry consumption. This policy still needs format approval.
- Workload is **one hidden path of depth 10**, not proving 1,024 independent credentials. Dataset parsing, validation and path reconstruction still count toward browser preparation time.

The architecture should keep one versioned application-hash/tree specification and vectors, with separate private-proof and public-reveal adapters. The proof-system transcript hash need not equal the credential hash. There is no reason to port a STARK verifier to Solidity for this scope.

## Candidate assessment

| Candidate | Concrete evidence | Decision under revised scope |
| --- | --- | --- |
| **Noir + ProveKit base WHIR** | Source describes ACIR→R1CS→Spartan-style WHIR proofs; `WhirR1CSScheme.whir_witness` is explicitly `whir_zk::Config`, not ordinary WHIR. Prover contains ZK sumcheck blinding and random blinding coefficients. Docs state base proofs need no trusted setup. WASM has real prover/verifier exports and browser entropy dependencies. [1–4] | **First qualification candidate**, but current docs say WASM self-prove/verify worked in their check while CLI cross-verification did not. They explicitly do not document a verified v1.0.2 JS end-to-end recipe. Do not replace this with an old search-result tutorial or silently patch cryptographic differences. |
| **Plonky3 ZK uni-STARK** | At pinned source below, `HidingFriPcs` requires hiding commitment schemes, unpredictable CSPRNG seeds, a disclosure budget, independent random codewords, and one-time opening of private prover data. Uni-STARK supplies the randomization polynomial. Existing real ZK round-trip and tamper tests execute successfully. [7–9] | Credible transparent **full-ZK construction to evaluate**, not merely STARK branding. No maintained complete browser attendance package was established. Fixed seeds and `new_testing` parameters in these tests are not production security/randomness. A WASM wrapper alone cannot certify the application AIR or unlinkability. |
| **Miden** | Official SDK documents dedicated-worker local browser proving and VM compilation, alongside optional remote proving. Source snapshot includes a generic hiding LMCS, but its built-in Blake3/Eidos/Keccak STARK factories instantiate ordinary `LmcsConfig`; presence of the hiding component does not establish that the shipped VM proof uses complete witness masking. [10–11] | Browser engineering is materially stronger than the old native-only assessment, but **full-ZK mode for arbitrary private attendance remains unestablished here**. Request the exact supported masking configuration and privacy argument before benchmarking it as private proof generation. Do not add Miden accounts/network transactions to a BSC attendance app just to obtain a browser API. |
| **Ligetron / Ligero Inc.** | Maintainer source has actual browser prover and verifier targets, private input indices, proof export/import, and a C++/Rust→WASM guest workflow. Official protocol docs explain random-polynomial masking and transparency. Current README requires WebGPU and explicitly has no fallback. [12–13] | Worth a separately bounded browser evaluation, especially on GPU-capable desktops. Current setup involves Emscripten, WASM dependencies and shader/runtime packaging; no pinned prebuilt complete fixture was established here. Firefox/WebGPU/device coverage and aggregate artifact/memory budgets are unresolved. Do not transfer Firefox timings from an older paper to this current WebGPU implementation. |

Inspected exact source snapshots: Plonky3 **`0d803737b681774186cd283b1fd2d8e493655c82`** (workspace crates identify as 0.8.0), Miden VM **`e99d29a079654a5080ec2a3fa8daa6842162207a`**, Ligero prover **`4b1cdef1bfdf4497fb3e38170db4541fba3f6c12`**. These are source pins, not a mutually interoperable tuple. ProveKit rolling HEAD resolved to `893f6d5866d52124e12c4a90a71c0f4d625f083b`; it was **not** substituted for v1.0.2.

The earlier Stwo/Solidity fixture remains historical evidence, not this selection gate. Likewise, reject default Barretenberg/KZG, snarkjs/Groth16 and trusted-setup compression as fallbacks. A transparent base plus a setup-dependent wrapper does not satisfy the rule. Winterfell's previously documented privacy warning and deprecated Plonky2 are not repaired by removing the EVM requirement. The previously investigated Spartan-WHIR lane can now omit LeanVM/EVM recursion entirely, but its native full-ZK availability still does not establish a maintained browser product; do not carry its old terminal-verifier gas/size failures into this private-only decision.

### Setup and privacy boundaries

ProveKit preparation produces circuit-specific public preprocessing artifacts, not a powers-of-tau ceremony according to its security documentation. BN254 **field arithmetic alone** does not imply pairings, KZG or a trusted setup. Its optional recursive Groth16 branch does introduce setup and is excluded. The source's use of a ZK WHIR configuration **and** blinded outer sumcheck is stronger evidence than a generic WHIR label; this report is not a cryptographic audit of their composition. [1–4]

Plonky3's cited hiding-FRI documentation explicitly says both commitment schemes must be hiding and that CSPRNG type bounds do not make predictable seeds safe. Generate fresh private masks and salts from browser CSPRNG entropy for every proof; never reuse a deterministic test configuration or previously committed private prover data. Test that the actual WASM entropy path is wired, not just the native path. [7]

Different proof bytes are not proof of unlinkability. Review every public input, serialization field and log; bind chain, DAO, event, root and approved relation/configuration; expose no entry, position, signature, credential nullifier or deterministic witness commitment. Use only application-approved verifier artifacts, never a key/program supplied by a proof file. Public claiming irreversibly discloses the credential: private ZK cannot make that public secret private again.

## Supported application-hash candidate, and a compatibility trap

TACEO's pure-Noir Poseidon2 is already a dependency in multiple ProveKit examples, including its `basic` hash-preimage example. It uses ordinary constrained arithmetic rather than assuming Barretenberg's Poseidon2 black-box implementation is supported by another backend. Width 4 uses the BN254 scalar prime

```text
21888242871839275222246405745257275088548364400416034343698204186575808495617
```

with exponent 5, eight full rounds and 56 partial rounds, with matrices/constants owned by that exact library. Its Solidity candidate supplies the same family of permutations and field-range checks. **It is explicitly unaudited.** [5–6]

Important source-level distinction: Noir `permutation::t4(input)` returns the full permutation. Solidity `compress(input)` returns **`permutation(input)[0] + input[0] mod p`**, with feed-forward. Therefore copying the ProveKit basic example's `permutation(...)[0]` and calling Solidity `compress` will disagree even if all constants match. Use the raw permutation APIs to establish vectors first, then specify a reviewed hash mode identically in all runtimes. Do not call permutation projection, compression, and sponge “Poseidon2 hash” interchangeably. [5–6]

Propose, but do not freeze, a domain-separated width-4 sponge/compression design for recovery, entry, leaf, internal node and empty padding. Choose rate/capacity, output width, lengths, padding and limb ordering explicitly. Recovery can remain off-circuit; entry derivation and every path hash must be constrained. Use lossless bounded limbs for 256-bit secrets/proposal IDs; reject noncanonical field inputs instead of silently reducing bytes modulo p. A single BN254-field output has a generic collision ceiling about **126.8 bits**, not an exact 128-bit claim. Security level remains an approval decision; field width and round counts alone do not settle it.

The Solidity README reports checked T4 hashing around 25,724 gas with its Yul core at 200 optimizer runs and runtime 6,760 bytes. **Those are upstream figures for a hash entrypoint, not our measurements, not a complete 10-level claim cost and not BSC transaction evidence.** Its inline/linked trade-offs affect whole-DAO code size; measure the actual ordinary public claim separately, without deploying during this investigation. [6]

Required shared vectors before format approval: full permutation, selected hash mode, recovery bytes, context→entry, leaf/node/empty domains, complete depth-10 tree/path; canonical maximum values and rejected out-of-range fields; sets of size 0, 1, 2, 3, 1,023, 1,024 and rejected 1,025. Bytewise sort/dedup, positional path bits, empty padding and empty-root semantics must be agreed once, not independently by the private/public implementations.

## What actually ran

### Native genuine ZK protocol controls: PASS, not browser benchmarks

Cloned only isolated source trees under `/tmp/opencode/private-zk-*`. Installed a minimal Rust toolchain with isolated `CARGO_HOME`/`RUSTUP_HOME`, no PATH/profile edits. Actual compiler: **rustc 1.100.0 (`0ef1bc386`, 2026-11-09)**, stable release discovered by rustup on this date. Linux `6.8.0-1070-azure`, AMD EPYC 7763 exposed as four logical CPUs; shared Codespaces VM, not a controlled consumer-device baseline.

From the pinned Plonky3 checkout:

```sh
export CARGO_HOME=/tmp/opencode/private-zk-rust/cargo
export RUSTUP_HOME=/tmp/opencode/private-zk-rust/rustup
export PATH="$CARGO_HOME/bin:$PATH"
cd /tmp/opencode/private-zk-p3
cargo test --release -p p3-uni-stark --test fib_air zk -- --nocapture
cargo test --locked --release -p p3-uni-stark --test transcript_binding \
  a_tampered_randomization_commitment_is_rejected -- --exact
```

Results:

| Actual check | Result |
| --- | --- |
| Existing `fib_air::test_zk` | PASS: generates and verifies a 32-row Fibonacci proof using hiding FRI/hiding MMCS |
| Existing `fib_air::test_degree_bits_too_small_for_zk_rejected` | PASS: generates a ZK proof, changes its degree metadata to 0, requires structured rejection |
| Existing `transcript_binding::a_tampered_randomization_commitment_is_rejected` | PASS: verifies untouched ZK proof, replaces randomization commitment with trace commitment, requires rejection |
| First Cargo build/test invocation | Cargo reports release build 39.34 s; two-test suite 0.00 s at its displayed precision |
| Separate tamper-test invocation | Cargo reports build 10.28 s; one-test suite 0.00 s at displayed precision |

These are **not meaningful proving-time measurements**: Cargo's build times are not prover times and its test timer is too coarse. No attendance path, browser, fresh-entropy test or production-strength security configuration was measured. Upstream uses fixed `StdRng` seeds and `FriParameters::new_testing` in these fixtures. No parameters/source were weakened or patched. Warnings were left intact. [8–9]

Plonky3 does not provide a committed root lockfile in this snapshot; the first command resolved one, so it was not described as a frozen-lockfile run. Saved generated lock SHA-256: **`1143c184bc1939f82e0c1d75139f7e7e81b8ad57d401761d017c5b1eb1710347`**. The second command used it with `--locked`. Local evidence: `/tmp/opencode/private-zk-evidence/{p3-fib-zk.log,p3-tamper-zk.log,p3-Cargo.lock}`. These are temporary session artifacts; preserve them before the environment expires. ProveKit's inspected, upstream-committed lock SHA-256 is `64371d15c0ac3efb7521937ff56a0f9d071b05b7e4965c836b67ef70ee9c02db`.

### Browser attempt: blocked before page execution

Loaded the agent-browser skill and its CLI core guide. Used **agent-browser 0.43.0**, task session `private-zk-005a3a02bd41`. Downloaded official Chrome for Testing **157.0.8103.78** using `agent-browser install`. The CLI stores it at `/home/codespace/.agent-browser/browsers/chrome-157.0.8103.78` (tool-managed cache outside the isolated source trees); no global installer/profile changes or system package changes were made.

Inspected the actual published `@atheonxyz/verity@0.3.2-beta` tarball, SHA-256 `e085a726924cac54ab3d98bd5ce45b8082f6d79804267ed9373b31d4b138fdab`. It includes a **2,816,231-byte** `provekit_wasm_bg.wasm`, but no `.pkp`/`.pkv` fixtures. That one file is not the complete proving-download budget, and this package is **not the recommended v1.0.2 source tuple**. Current ProveKit docs warn about beta.11 SDK vs beta.26 core compatibility. No keys or proofs from different versions were combined. [2]

Prepared a tiny localhost TypeScript static server (`pnpm dlx tsx@4.21.0`, port 4319) with COOP/COEP and a page that only attempts WASM/thread-pool initialization and malformed-verifier rejection. This is explicitly a **loader control**, not a proof test. Actual command:

```sh
pnpm dlx agent-browser@0.43.0 --session private-zk-005a3a02bd41 \
  open http://127.0.0.1:4319
```

**Failed before navigation**, Chrome exit 127: `libatk-1.0.so.0` missing. `agent-browser doctor` reproduced the launch failure. `ldd` also reports missing `libatk-bridge-2.0.so.0`, `libcups.so.2`, `libxkbcommon.so.0`, `libasound.so.2`, `libgbm.so.1`, `libXcomposite.so.1`, `libXdamage.so.1`, `libXfixes.so.3`, `libXrandr.so.2`, and `libatspi.so.0`. No browser JS, WASM initializer, proof generation, verifier rejection or benchmark ran. Firefox was not installed or tested. No OS package upgrade, GPU-driver installation or destructive repair was attempted.

## Remaining qualification gates and next runnable step

1. **Repair browser environment first:** on a disposable browser-capable machine/image, install the supported Chrome runtime dependencies, then rerun the localhost loader control in `/tmp/opencode/private-zk-verity/smoke.ts` using the commands above. `agent-browser install --with-deps` is the CLI-supported system-dependency route; review its system changes before running it. That control cannot resolve the ProveKit version/interop blocker.
2. **Qualify the preferred exact source tuple:** from v1.0.2, run the source README's smallest `noir-examples/basic-4` `prepare`→`prove`→`verify` control with the pinned toolchain. Build `tooling/provekit-wasm` using its manifest's exact WASM command; use beta.26 NoirJS/ACVM. Require browser→browser and native↔browser proof/key interchange, altered public output and tampered proof rejection. Ask upstream to resolve the documented interoperability failure rather than inventing a new protocol or silently accepting runtime-dependent configurations.
3. **Only after tiny round trips:** use pure-Noir Poseidon2 for a secret-preimage proof, enforce shared hash vectors, then the real depth-10 membership relation. Authenticate roots and pin verifier artifacts. Test wrong secret/sibling/path/context, invalid encodings, unsupported configurations, and witness/public-file leakage. Review entropy and construction-level ZK, not merely proof-byte differences.
4. **Measure Chrome and Firefox independently:** five cold and ten warm trials on named hardware, including dataset validation, witness building, initialization and proof export; report cold downloads separately. Count all JS/WASM, ACVM, circuit, prover and verifier/preprocessing artifacts, compressed and uncompressed. Measure aggregate browser/worker/process memory, not only JS heap. Until those runs, **60 s, 1 GiB and 50 MiB all remain unverified**.
5. **Separate public-claim work:** after hash/format approval, measure ordinary Solidity entry derivation plus depth-10 membership and entry consumption, wrong-path non-consumption, duplicate claims across senders, and actual BSC limits/cost. No deployment was performed or authorized by this report.

**Immediate runnable next step:** restore the listed browser runtime libraries in a disposable image and rerun the localhost loader control; meanwhile the exact native Plonky3 positive/tamper commands above are reproducible today. The product blocker is a supported, pinned full-ZK browser round trip, **not a Solidity ZK verifier**.

## Primary sources

1. [ProveKit v1.0.2 source README and smallest native example](https://github.com/worldfnd/provekit/blob/4ee40639fb8849aeeba37761fdda07f28367e81d/README.md), [toolchain](https://github.com/worldfnd/provekit/blob/4ee40639fb8849aeeba37761fdda07f28367e81d/rust-toolchain.toml), [security/trust model](https://docs.provekit.org/concepts/security-model/).
2. [Current JS compatibility warning](https://docs.provekit.org/e2e/js-typescript/), [project status](https://docs.provekit.org/reference/project-status/), [actual v1.0.2 WASM bindings/build instructions](https://github.com/worldfnd/provekit/tree/4ee40639fb8849aeeba37761fdda07f28367e81d/tooling/provekit-wasm). Live docs inspected 2026-11-13, display updated 2026-11-05; search-index copies contain superseded tutorials.
3. [ZK WHIR scheme type](https://github.com/worldfnd/provekit/blob/4ee40639fb8849aeeba37761fdda07f28367e81d/provekit/common/src/whir_r1cs.rs), [blinded sumcheck/commitment and entropy calls](https://github.com/worldfnd/provekit/blob/4ee40639fb8849aeeba37761fdda07f28367e81d/provekit/prover/src/whir_r1cs.rs).
4. [ProveKit integration support and excluded recursive setup path](https://docs.provekit.org/integrations/overview/), [World Foundation's protocol explanation](https://world.org/blog/engineering/provekit-privacy-for-the-real-world).
5. [TACEO pure-Noir Poseidon2, exact tag](https://github.com/TaceoLabs/noir-poseidon/tree/36c8db5a86795038822323dee790dd760372766d/poseidon2), [ProveKit basic example dependency](https://github.com/worldfnd/provekit/blob/4ee40639fb8849aeeba37761fdda07f28367e81d/noir-examples/basic/Nargo.toml).
6. [TACEO Solidity source, API, reported gas/sizes and unaudited warning](https://github.com/TaceoLabs/poseidon2-solidity/tree/4c599a08a45cd465a153d724425cee331c010df1), [T4 feed-forward and raw-permutation implementation](https://github.com/TaceoLabs/poseidon2-solidity/blob/4c599a08a45cd465a153d724425cee331c010df1/src/Poseidon2T4_BN254.sol).
7. [Plonky3 hiding-FRI source and privacy obligations](https://github.com/Plonky3/Plonky3/blob/0d803737b681774186cd283b1fd2d8e493655c82/fri/src/hiding_pcs.rs), [toolkit scope](https://github.com/Plonky3/Plonky3/blob/0d803737b681774186cd283b1fd2d8e493655c82/README.md).
8. [Exact executed ZK Fibonacci fixtures/configuration](https://github.com/Plonky3/Plonky3/blob/0d803737b681774186cd283b1fd2d8e493655c82/uni-stark/tests/fib_air.rs).
9. [Exact executed randomization-commitment tamper test](https://github.com/Plonky3/Plonky3/blob/0d803737b681774186cd283b1fd2d8e493655c82/uni-stark/tests/transcript_binding.rs).
10. [Miden SDK browser/local/remote proving architecture](https://docs.miden.xyz/builder/tools/clients/web-client), [VM documentation and upstream performance context](https://docs.miden.xyz/reference/miden-vm/performance/). Its native figures are not browser attendance measurements.
11. [Miden built-in STARK factories](https://github.com/0xMiden/miden-vm/blob/e99d29a079654a5080ec2a3fa8daa6842162207a/crates/stark/core/src/config/miden.rs), [separate hiding-LMCS component](https://github.com/0xMiden/miden-vm/blob/e99d29a079654a5080ec2a3fa8daa6842162207a/crates/stark/core/src/lmcs/hiding_config.rs).
12. [Ligero maintainer browser build, proof exchange, WebGPU requirement](https://github.com/ligeroinc/ligero-prover/blob/4b1cdef1bfdf4497fb3e38170db4541fba3f6c12/README.md).
13. [Ligetron protocol transparency and masking explanation](https://docs.ligetron.com/docs/introduction/ligero-protocol), [guest/runtime architecture](https://docs.ligetron.com/docs/introduction/zkvm).
