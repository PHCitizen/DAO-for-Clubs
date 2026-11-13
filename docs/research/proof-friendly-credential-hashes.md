# Proof-friendly credential hashes: matched-pipeline follow-up

Date: 2026-11-13. Research only; no cryptographic format, security parameters,
production implementation, or migration policy is approved here.

## Recommendation

**Replacing SHA-256 removes an application-circuit cost constraint, but does
not yet yield a validated transparent browser-to-EVM ZK pipeline.** Do not
select Poseidon2 parameters or unblock production proof/publication features.
The concrete Stwo Solidity port found below is an interoperability research
lead, not a complete attendance verifier: its Poseidon evaluator explicitly
omits the hash constraints. Its browser and ZK compatibility are also not
established. A newer Spartan-WHIR/LeanVM route has substantially better
documented full-ZK semantics, but its complete terminal verifier exceeds the
ordinary EVM runtime-code limit and the documented recursion runs natively,
not in the required browsers. [2–10]

**Next executable step:** reproduce the Stwo port's existing Fibonacci fixture
locally, without deploying, as the narrow interoperability control in the
smoke-test section. Do not start an attendance AIR from that passing fixture.
The blocking next deliverable is a pinned, complete, ZK-masked browser prover
and Solidity verifier of the *same statement/protocol*, including transcript
initialization and real hash constraints. No such matched configuration was
established in the examined sources. This is an explicit integration blocker,
not proof that the requirements are mathematically impossible.

## Changed requirement and invariant statement

Read root `AGENTS.md`, `docs/agents/domain.md`, `GLOSSARY.md`,
`todos/01-transparent-zk-feasibility.md`, `docs/attendance-credentials.md`, and
`docs/research/transparent-attendance-proofs.md`. `GLOSSARY-MAP.md` was absent.
This note follows the subsequent user approval: a **new credential version**
may replace secret/entry, tree, and nullifier hashes, accepting regenerated QR
entries. Existing v1 message, ABI serialization, signature bytes, SHA-256
derivations, QR semantics, and vectors remain frozen.

Credential recovery can remain **off circuit**. The proof establishes
possession of transferable evidence of an organizer's attendance attestation,
not ECDSA identity. A versioned signature-to-secret recovery function can use
the eventual hash without proving its execution. Real-wallet repeat-signing
and recovery remain a separate unexecuted gate. In contrast, **entry derivation
from the secret, secret-linked deterministic nullifier derivation, and every
membership-path step must be constrained**. Host/WebCrypto/WASM computation
alone does not establish those relations.

For a 1,024-member set, prove one hidden depth-10 path, not 1,024 memberships.
Bind chain, DAO deployment, event, finalized root, and approved configuration;
public claims additionally bind recipient. The nullifier must be independent
of recipient and fresh prover randomness. Private presentations reveal neither
entry, position, nor claim nullifier, and need actual ZK masking with fresh
cryptographic randomness—not merely different serialized proofs. No backend,
trusted-setup wrapper, or service aggregation may silently enter the pipeline.

## 1. Stwo: concrete components and compatibility gaps

### Official upstream and browser evidence

The official `dev` snapshot is
`starkware-libs/stwo@826591c6c371376810ca8213b5812d5daf6d5092`.
It documents M31 (`2^31−1`), CM31/QM31 extensions, optional Rayon, WASM SIMD,
Keccak and other channels, and explicitly makes downstream Solidity fidelity
the deployer's responsibility. Its README's SHARP production claim is not
evidence for backend-free private browser proving. Its announced successor
`starkware-libs/proving` returned 404 for both `main/README.md` and
`dev/README.md` in this inspection; that is an access/source-discovery blocker,
not evidence that the software does not exist. The old `main` README differs
from `dev`; do not mix branch instructions. [1]

The official CI uses `nightly-2026-01-15`, WASM SIMD, and
`wasm-pack 0.13.1`; its `wasm32-unknown-unknown` command is
`cd crates/stwo && wasm-pack test --node`. Its other WASM job is WASI under
Wasmtime. Neither is Chrome/Firefox proving evidence. [2]

The implementer's `AbdelStark/stwo-wasm-demo` has a real `cdylib`,
`wasm-bindgen`, JS-enabled `getrandom`, and a `wasm-pack build --target web`
instruction. But its source calls the older `stwo_prover::examples::fibonacci`
API; its manifest names `stwo-prover` from unqualified upstream Git, not the
Keccak fork used by the Solidity integration. `run_fibonacci_example` returns
only success/message after local prove/verify; it does **not export proof bytes
to Solidity**. No documented ZK configuration or shared Solidity fixture was
identified there. It is a historical browser control, not a compatible drop-in
prover for the current port. [3]

### Actual direct Solidity port

`piotr-stec/stwo-verifier@d27b6bd1089cd2d04e416119fdb6e2995cc02180`
contains real M31/QM31, Keccak transcript, Merkle, OODS, and FRI Solidity code.
This is the port implementer's primary source, **not an official StarkWare
endorsement or an audit**. Important concrete boundaries: [4–6]

- `STWOVerifier.verify` accepts an evaluator address, component metadata,
  `proof.config`, tree roots/column sizes, and externally initialized `digest`
  and `nDraws`. The comment explicitly says the digest should already include
  earlier commitments. It therefore is not an application-safe entrypoint on
  its own. A trusted wrapper would need to fix the AIR/security configuration
  and independently derive the transcript from authenticated statement and
  commitments; never trust these choices from an attendee.
- `FibonacciFlowTest.test_FibonacciFlowProofVerification` is a real embedded
  fixture with **3 FRI queries**, blowup log 1 and PoW 10, plus a hard-coded
  transcript digest. It checks acceptance and logs gas; it does not demonstrate
  production security, negative attendance tests, browser serialization, or
  ZK. Do not benchmark that query count as a secure claim.
- Most decisively, `contracts/framework/PoseidonEval.sol` says
  **“Poseidon hash constraints would go here”** and **“we skip the full Poseidon
  implementation”**. Its parameter setter is externally callable. Finding a
  Poseidon-named file is not finding a complete constrained hash verifier.
- Foundry pins Solidity 0.8.26, Cancun, via-IR, and 1,000,000 optimizer runs.
  These are reproduction details, not demonstrated BSC compatibility or size
  feasibility.

### Closely related privacy-pools prover is not the missing browser/ZK match

`anhelinakruk/privacy-pools-stwo@13717b0ca512ce5f58d5c4d73e59e0fffe4b9815`
names the same port ecosystem. Its committed lockfile resolves:

| Dependency | Locked revision |
| --- | --- |
| `piotr-stec/stwo-fork-keccak`, `channel/solidity` | `b522d834ad42ba1e7392025bf87dd6602d692798` |
| `piotr-stec/stwo-polynomial`, `feat/privacy-pool-with-merkle` | `db230c5af3c2a9e3eb2a2ac61ad2a329d2f9f6bf` |
| `AntoineFONDEUR/poseidon2`, `poseidon2-M31` | `5f715d0c9b34f427f8b6b05ddbafc82379e73b20` |

These are actual source-provenance pins, **not a demonstrated compatible tuple
with the Solidity head above**. The manifest includes native networking/node
bindings and Tokio. `poseidon_chain/prove_verify.rs` selects `SimdBackend`,
`KeccakChannel`, and `KeccakMerkleChannel`, uses default PCS configuration,
returns a composition polynomial alongside the proof, and passes it into its
forked native verifier. That transport must be explained and privacy-reviewed;
it must not be assumed equivalent to ordinary ZK proof export. No masked-ZK
browser export/contract round trip was established. [7]

Its E2E RPC test is also weaker evidence than its name suggests: the declared
`PrivacyPool.withdraw(root,nullifier,token,amount,recipient)` ABI has **no proof
argument**, and the test submits no STARK proof. It exercises deposits,
withdrawals, and duplicate-nullifier rejection, not a proved withdrawal. [8]

## 2. Alternative concrete route: Spartan-WHIR → LeanVM → Solidity

The Ethereum client-side-proving implementation
`ethereum/spartan-whir@14d6da4211eda59e65cfd0af5e2dcd89d523edc3` documents
KoalaBear R1CS, separate no-ZK/full-ZK APIs, DirectSparse/Spark closing,
Poseidon2 or Poseidon1 proof hashing, and relation/configuration/public-input
binding. It references the full-ZK construction *Zero-Knowledge IOPPs for
Constrained Interleaved Codes*. Its documented example generates C++ witnesses
and native Rust proofs, not browser proofs. Its circuit-specific `setup`
operation must not be mistaken merely by name for a ceremony; the complete
preprocessing and recursion path still needs a no-trapdoor audit. [9]

The matched terminal route is **not** just “Spartan-WHIR proof into a WHIR
Solidity contract”:

1. Client full-ZK Spark proof with its precise KoalaBear/Poseidon configuration.
2. LeanVM `recursive-verifier` branch proves execution of that verifier.
3. Unary lift, then a fixed two-proof aggregation node.
4. `ethereum/sol-whir-p3`'s
   `LeanVmGroupedTerminal_KeccakPow28T6.verifyGroupedLogupV1` verifies the root
   proof/program/application commitments directly in Solidity. [10–11]

The implementers report 96.0 seconds **sequential native LeanVM proving for
two withdrawals** on M4 Pro/12 threads, excluding 1.2 seconds preprocessing;
10.7 million terminal transaction gas; and 62,623 bytes terminal runtime.
These are upstream measurements of another workload, not ours and not a
single-credential lower bound. They do not pass a 60-second browser budget.
The current terminal runtime exceeds EIP-170's 24,576-byte limit, and the
project explicitly says networks enforcing it need a split verifier or other
architecture. No BSC deployment was reproduced. Proposed Ethereum size-limit
changes are not BSC permission. [10–11]

The standalone KoalaBear quintic WHIR verifier is only a **PCS opening
verifier**, not the full Spartan attendance relation. Its current README
reports dense-proof transaction gas about 2.97 million and 35,671-byte runtime;
the smaller quartic fixture targets 80 bits and still only verifies PCS.
The exporter's README explicitly says it **does not depend on the current
client-side Spartan-WHIR SNARK**, and labels its Spartan fixture a placeholder.
Do not join these incompatible layers by name. [11–12]

This route is worth monitoring because full ZK and an actual terminal pipeline
are documented. It is not presently a supported matched browser/BSC candidate.
Moving the aggregation to a backend breaks the requirement; moving it to the
browser requires all recursion time, memory and artifacts in the same budget.

## 3. Hash comparison tied to those configurations

Three distinct uses must not be conflated: **credential hashes**, the
**attendance Merkle tree**, and the proof system's **commitment/transcript
hashes**. Proof-friendly credential hashing does not force the EVM verifier
to hash every attendance sibling itself; a complete AIR/R1CS verifier checks
those constraints at evaluation points. Conversely, changing the proof's
commitment/transcript hash changes protocol/serialization compatibility.

| Candidate | Field/parameters and concrete support | Assessment, not selection |
| --- | --- | --- |
| Reviewed M31 Poseidon2 instance | Natural Stwo base-field arithmetic. Plonky3's Mersenne31 implementation supplies width-16, exponent 5, 8 full/14 partial rounds, generated constants, optimized diffusion matrix, and vectors; other widths have different round counts. [13–14] | A credible reference to evaluate and port into a **complete** AIR, not proof that Stwo's example or Solidity port implements that exact instance. Review sponge/compression construction, capacity, digest size and security margin separately from permutation rounds. |
| Stwo's own `examples/poseidon` | Width 16 and nominal 8/14 rounds, but round constants are all `1234`; source has TODOs for real constants, diffusion coefficients, and round ordering. Native prove tests are ignored with “AIRs with constraint degree >= 2 are not supported yet in the lifted protocol.” [15] | Reject as a credential-hash specification. A throughput benchmark of this toy AIR does not establish cryptographic hash security or a working current lifted-protocol attendance prover. |
| Privacy-pools M31 Poseidon2 fork | Uses explicit constants and a different, random-looking internal diagonal, with zkhash reference provenance. Its `test_our_poseidon2_vs_zkhash` has the equality assertion commented out. The E2E helper takes two `u32`s, pads state with zero and returns eight M31 limbs. [8,16] | Better than placeholder constants, but no demonstrated audited sponge, full-input encoding, or matched Solidity constraints. The equality test's printed success/failure cannot substitute for an enforced vector test. It is not interchangeable with Plonky3's optimized diagonal. |
| Stwo `Poseidon252Channel` (prover-supported Poseidon, not Poseidon2) | Uses `starknet_crypto` felt252 Poseidon and packing of M31 limbs, with draw/mix domain separation; this is host transcript/commitment support, not an M31 credential AIR gadget. [17] | The large field is not Stwo's native AIR field. Reusing it inside membership constraints needs non-native arithmetic or a proved accelerator. It also is not the Keccak Solidity port's channel. Support in a prover library does not establish the desired efficient circuit or EVM match. |
| Spartan-WHIR native KoalaBear Poseidon1/Poseidon2 | Official implementation distinguishes the types. Selected full-ZK Spark recursion uses Poseidon1 proof hashing, while its withdrawal relation uses Poseidon2; the documented Poseidon1 engine has width 16/rate 8. [9–10] | Strong example of choosing per-layer supported hashes rather than one generic “best hash.” M31, KoalaBear and BN254 instances are different functions. An existing BN254 Poseidon Solidity implementation cannot validate a KoalaBear or M31 vector. |

“Reviewed” here means a precise candidate can be assessed against the authors'
construction and implementation; **this research performed no cryptographic
audit and found no audit covering the complete proposed attendance pipeline**.
Poseidon2's authors' reference implementation and paper are primary starting
points, not an endorsement of every downstream parameterization. [13]

Before choosing any instance, require:

- Exact prime, width, exponent, rounds, matrices, constants and generation
  algorithm, sponge/compression mode, rate/capacity, digest limbs, padding and
  security analysis at the user-approved target. For a generic field-output
  hash, one M31 element has only about 31 output bits (about 15.5-bit generic
  collision bound). Eight M31 outputs are less than 248 bits of range, so even
  their generic birthday ceiling is below 124 bits, **not 128**. Capacity and
  cryptanalysis can lower bounds further. Do not equate a `bytes32` container
  with 256 bits of hash security or a QM31 challenge with a credential digest.
- Canonical, injective byte/context-to-field encoding, explicit lengths,
  endianness and rejection of noncanonical field values. In particular,
  mapping a 256-bit secret or 160-bit address modulo M31 loses information.
  Small bounded limbs can encode bytes losslessly; a hash-to-field recovery
  function is a separate reviewed construction. Preserve sufficient secret
  entropy; the demo's single `u32` secret is not a credential design.
- Separate domains for recovery, entry, leaf, internal node, empty padding and
  nullifier; include scope and lengths unambiguously. A permutation on
  `[a,b,0,…]` alone does not specify a safe variable-length credential hash.
- Native Rust, browser WASM/host, constraint and Solidity **evaluation** vectors
  for the same construction. Solidity need not expose a standalone application
  hash if it only verifies an AIR, but its constraint evaluator must be complete
  and equivalent. Verify whole-input, maximum-value, padding, and malformed
  encoding cases—not just one permutation vector.
- An allowlisted complete verification configuration. Never let proof files
  choose arbitrary AIRs, evaluator contracts, keys, transcript seeds, query
  counts, or recursion program identities.

## 4. Version transition and duplicate-claim bypass remain unresolved

New QR entries require a new credential version, signing/recovery description,
vectors, and explicitly single-version finalized attendance sets. Existing v1
sets/credentials must never be silently rehashed or reinterpreted. Proof-format
version and credential version are distinct concepts.

Changing the entry/secret hash can change the nullifier for the same underlying
credential. Including version or recipient in a new nullifier namespace can
allow another claim; simply omitting version does **not** solve that when the
underlying secret also changes. Neither independently generated hashes nor an
event-ID convention proves v1/v2 credential equivalence.

Potential policies needing user/security agreement include immutable per-event
credential versions with no dual-root claims, or an explicitly proved migration
that carries forward claim consumption across versions. The latter could
require legacy hashing/equivalence constraints and defeat assumptions about an
all-proof-friendly migration. This note selects neither. Enforce one claim per
credential through transfer and proof upgrades; do not claim one-person-one-
attendance, which the transferable organizer-attestation model does not supply.

## 5. Small executable control; explicit stop conditions

No installs, builds, proofs, browser runs, or deployments were performed here.
After obtaining the pinned source and its Foundry dependency, the existing
port's **exact source-defined native fixture command** is:

```sh
# Working directory: piotr-stec/stwo-verifier at
# d27b6bd1089cd2d04e416119fdb6e2995cc02180 (isolated research checkout).
forge test --match-contract FibonacciFlowTest \
  --match-test test_FibonacciFlowProofVerification -vv
```

This tests an embedded low-security fixture only. Record Foundry/solc versions,
source/dependency pins, output, gas and sizes. Do not deploy, suppress failing
checks, reduce parameters, or present a pass as ZK/browser feasibility. Its
README's default `Counter` deployment instruction is Foundry boilerplate, not
an upstream attendance deployment recipe. [4–6]

**Stop before custom attendance work** unless a maintainer-supported source
tuple supplies: (a) complete hash constraints and public-statement transcript
initialization; (b) justified ZK masking/fresh randomness compatible with that
Solidity verifier; (c) reproducible `wasm32-unknown-unknown` export of those
proofs. The fixture above cannot answer any of these. Request those concrete
artifacts from upstream rather than inventing a purported working browser
command or a speculative new verifier.

Only after that gate: run a tiny hash-preimage browser→Solidity round trip with
wrong-preimage/context/recipient/nullifier tests, then the real depth-10
membership statement, then Chrome **and Firefox** budgets. Count host witness
preparation, fresh ZK randomness, all recursion, initialization and export in
complete proving; measure cold downloads separately and count **all** proving
artifacts. Use aggregate browser/worker/process peak memory, not JS heap alone.
Targets remain ≤60 seconds, ≤1 GiB and ≤50 MiB; none is verified. BSC testnet
deployment, transaction inclusion, calldata/code limits, invalid-proof handling,
and an approved gas/cost ceiling remain independent gates.

## Evidence status

This pass inspected primary source files and lockfiles over HTTP and resolved
Spartan-WHIR HEAD with `git ls-remote`; it did not measure a cryptographic
workload. Upstream gas/timing/code sizes above are explicitly attributed
reports, not reproduced results. GitHub API rate limiting interrupted further
tree discovery; raw source remained accessible. No heavy dependencies were
installed. No parameters or implementations were frozen. No production ticket
is unblocked.

## Primary sources

Third-party integration repositories below are primary evidence of their
authors' implementations, not official guarantees from StarkWare. Mutable
URLs were inspected on the date above; snapshots are pinned where resolved.

1. [Official Stwo dev README, exact snapshot](https://github.com/starkware-libs/stwo/blob/826591c6c371376810ca8213b5812d5daf6d5092/README.md), [migration destination](https://github.com/starkware-libs/proving).
2. [Official CI, WASM jobs/toolchain](https://github.com/starkware-libs/stwo/blob/826591c6c371376810ca8213b5812d5daf6d5092/.github/workflows/ci.yaml).
3. Browser-demo author's [README](https://github.com/AbdelStark/stwo-wasm-demo/blob/main/README.md), [manifest](https://github.com/AbdelStark/stwo-wasm-demo/blob/main/Cargo.toml), [actual JS-exported function](https://github.com/AbdelStark/stwo-wasm-demo/blob/main/src/lib.rs).
4. Port author's [actual Solidity entrypoint](https://github.com/piotr-stec/stwo-verifier/blob/d27b6bd1089cd2d04e416119fdb6e2995cc02180/contracts/verifier/StwoVerifier.sol).
5. [Actual Fibonacci fixture/configuration/test](https://github.com/piotr-stec/stwo-verifier/blob/d27b6bd1089cd2d04e416119fdb6e2995cc02180/test/framework/FibonacciFlowTest.sol).
6. [Incomplete Poseidon evaluator](https://github.com/piotr-stec/stwo-verifier/blob/d27b6bd1089cd2d04e416119fdb6e2995cc02180/contracts/framework/PoseidonEval.sol), [Foundry configuration](https://github.com/piotr-stec/stwo-verifier/blob/d27b6bd1089cd2d04e416119fdb6e2995cc02180/foundry.toml), [boilerplate README](https://github.com/piotr-stec/stwo-verifier/blob/d27b6bd1089cd2d04e416119fdb6e2995cc02180/README.md).
7. Privacy-pools author's [manifest](https://github.com/anhelinakruk/privacy-pools-stwo/blob/13717b0ca512ce5f58d5c4d73e59e0fffe4b9815/Cargo.toml), [lockfile](https://github.com/anhelinakruk/privacy-pools-stwo/blob/13717b0ca512ce5f58d5c4d73e59e0fffe4b9815/Cargo.lock), [actual prover/verifier transport](https://github.com/anhelinakruk/privacy-pools-stwo/blob/13717b0ca512ce5f58d5c4d73e59e0fffe4b9815/src/poseidon_chain/prove_verify.rs).
8. [E2E contract ABI and calls; small-input hash helper](https://github.com/anhelinakruk/privacy-pools-stwo/blob/13717b0ca512ce5f58d5c4d73e59e0fffe4b9815/e2e/contract_tests.rs).
9. [Spartan-WHIR implementation's exact README](https://github.com/ethereum/spartan-whir/blob/14d6da4211eda59e65cfd0af5e2dcd89d523edc3/README.md), [full-ZK paper](https://eprint.iacr.org/2026/391).
10. [Implementers' complete recursion description and reported measurements](https://hackmd.io/@clientsideproving/recursive-spartan-whir), [actual recursive guest documentation](https://github.com/Client-Side-Proving/leanVM/blob/recursive-verifier/crates/spartan_whir_guest/README.md).
11. [Solidity implementation's current API, measurement and code-limit disclosures](https://github.com/ethereum/sol-whir-p3/blob/main/README.md). Figures in this note follow this inspected README; the linked recursion write-up reports an older standalone-PCS gas figure.
12. [Exporter's explicit standalone-line/placeholder distinction](https://github.com/Client-Side-Proving/spartan-whir-export/blob/main/README.md), [earlier sol-whir implementation and matched Rust fork](https://github.com/privacy-ethereum/sol-whir/blob/main/README.md).
13. [Poseidon2 authors' reference implementation](https://github.com/HorizenLabs/poseidon2), [paper](https://eprint.iacr.org/2023/323).
14. [Plonky3 Mersenne31 Poseidon2 parameters, generated constants, matrices and vectors](https://github.com/Plonky3/Plonky3/blob/main/mersenne-31/src/poseidon2.rs).
15. [Official Stwo Poseidon example: placeholder constants, ordering TODO and ignored lifted-protocol tests](https://github.com/starkware-libs/stwo/blob/826591c6c371376810ca8213b5812d5daf6d5092/crates/examples/src/poseidon/mod.rs).
16. [Privacy-pools Poseidon constants, matrix and disabled reference equality assertion](https://github.com/anhelinakruk/privacy-pools-stwo/blob/13717b0ca512ce5f58d5c4d73e59e0fffe4b9815/src/poseidon_hash.rs).
17. [Official Stwo Poseidon252 channel: actual field conversion and domain separation](https://github.com/starkware-libs/stwo/blob/826591c6c371376810ca8213b5812d5daf6d5092/crates/stwo/src/core/channel/poseidon252.rs).
