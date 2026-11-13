# Pinned Stwo Solidity Fibonacci smoke test

Date: 2026-11-13. **The exact positive fixture passes; production remains blocked.**
This executes the narrow control in [the prior report, §5](proof-friendly-credential-hashes.md#5-small-executable-control-explicit-stop-conditions), not an attendance implementation or cryptographic audit.

## Measured outcome

| Check | Actual result |
| --- | --- |
| Exact Fibonacci fixture | PASS, 1 passed / 0 failed / 0 skipped, exit 0 |
| Verification call gas (`gasleft()` delta) | 21,008,961 |
| Whole test gas reported by Forge | 32,921,459 (includes fixture construction and local contract creation) |
| OODS gas logged inside verifier | 591,301 (part of verification, not additional) |
| First invocation | 27.502 s wall; compilation 25.47 s; suite 55.11 ms |
| Fully isolated confirmation | 23.145 s wall; incremental compilation 22.89 s; suite 57.20 ms |
| Existing nearby `testConfigValidation` | FAIL, exit 1: `Low query count should be invalid`; 1.902 s wall |

These are local Foundry EVM measurements, not BSC transaction gas, browser proving time, or a security estimate. No proof was generated: proof data are embedded in Solidity. No RPC, keys, network deployment, custom proof, security reduction, source patch, or failure suppression was used. Compiler warnings remain in the captured output.

## Source and environment

- Isolated source: `/tmp/opencode/stwo-smoke/source`, clean `git status --porcelain` after execution.
- Upstream: `https://github.com/piotr-stec/stwo-verifier.git`, detached at `d27b6bd1089cd2d04e416119fdb6e2995cc02180`.
- Recursive submodules obtained with `git submodule update --init --recursive`: `lib/forge-std` at `755e679abefaf6ca9a08b5b9b90a52fb9b4ee188`; no further submodules reported.
- Linux x86_64, kernel `6.8.0-1070-azure`, Codespaces/Microsoft VM; AMD EPYC 7763 exposed as 4 logical CPUs, approximately 15 GiB RAM, no swap. Shared/virtualized hardware; no peak-memory measurement.
- Forge absent from PATH and checked conventional binary locations. Downloaded official `foundry-rs/foundry` release **v1.9.0**, extracted only under `/tmp/opencode/stwo-smoke/bin`.
- `forge --version`: `1.9.0`, commit `6056c5845d34205a83cf7108042adb137325c9df`, dist build, timestamp `2026-11-02T20:28:32.434285913Z`.
- Solc: `0.8.26+commit.8a97fa7a.Linux.g++`.
- Read upstream README, `.gitmodules`, and `foundry.toml` before installation/testing. README is generic Foundry build/test boilerplate (its Counter deployment command was not used). Config remains Solidity 0.8.26, Cancun, optimizer enabled with 1,000,000 runs, via-IR; fuzz 1,000, invariants 256/depth 15. No config changes.
- Effective config captured with `forge config --json`: gas limit 1,073,741,824, `code_size_limit: null`, `enable_tx_gas_limit: false`. This harness pass is not ordinary-chain deployability evidence; limits were not overridden.

### Download provenance and checksums

Official GitHub API `releases/latest` returned HTTP 403. The official web redirect resolved latest to `v1.9.0`; the release's expanded-assets page supplied the archive/checksum names. Download URLs:

```text
https://github.com/foundry-rs/foundry/releases/download/v1.9.0/foundry_v1.9.0_linux_amd64.tar.gz
https://github.com/foundry-rs/foundry/releases/download/v1.9.0/foundry_v1.9.0_linux_amd64.sha256
```

`sha256sum -c` passed **before extraction/execution**. This checks the publisher-hosted checksum over HTTPS, not independently verified Sigstore identity/attestation.

| Artifact | SHA-256 |
| --- | --- |
| Foundry archive | `8d17599b42e3139f1a9c171be3798c4ed8e743ae17b84cc3435e57bf2a51ae99` |
| Extracted forge | `26fc0c5ef0574f543acf496674160fe9a2175922ae44fd32f46ee2d09fdff4bc` |
| Solc binary | `d5f23436f443edb85d8e76906d12f0a86ce0490e7663a9e608efeb7a93f149ef` |

Solc's checksum matches the official `ethereum/solc-bin` Linux manifest (`https://raw.githubusercontent.com/ethereum/solc-bin/gh-pages/linux-amd64/list.json`), entry `solc-linux-amd64-v0.8.26+commit.8a97fa7a`.

Isolation caveat: the first Forge run's `SVM_HOME` setting did not redirect compiler storage; Forge auto-downloaded solc into `/home/codespace/.local/share/svm/0.8.26`. The newly created binary and empty manager marker/lock files were moved into the isolated artifact directory and the newly created empty directories removed. No existing compiler files were overwritten or removed. The confirmation used `XDG_DATA_HOME=/tmp/opencode/stwo-smoke/data` with the verified compiler there. No global installer, profile, or PATH configuration was changed. An initial timing wrapper could not start because `/usr/bin/time` is absent (exit 127); actual runs used Bash `time` instead.

## What the test actually checks

Pinned [fixture source](https://github.com/piotr-stec/stwo-verifier/blob/d27b6bd1089cd2d04e416119fdb6e2995cc02180/test/framework/FibonacciFlowTest.sol), lines 37–42 and 1009–1068:

- `powBits=10`, `logBlowupFactor=1`, `logLastLayerDegreeBound=0`, **`nQueries=3`**. These are upstream low-security fixture parameters, unchanged; no production soundness claim follows.
- Creates `FibonacciEval(6)` and `STWOVerifier`, with three trace columns of extended log size 7, one constraint, maximum constraint log degree 7, and only offset-zero masks. Some comments still describe 50-column WideFibonacci/log size 3; executable values, not comments, are reported here.
- Supplies digest `0x8967316dba25c11866b9dc29d5b956d7341c49f4694cbebc3b29e492355ce8c5` and `nDraws=0`, rather than deriving a public-statement transcript.
- Calls `verifier.verify(...)` and **enforces `assertTrue(result, "FibonacciFlow proof verification failed")`**. This is a real acceptance assertion, not just a printed success message.

The [Fibonacci evaluator](https://github.com/piotr-stec/stwo-verifier/blob/d27b6bd1089cd2d04e416119fdb6e2995cc02180/contracts/framework/FibonacciEval.sol) adds exactly one relation, `c - (a + b) = 0`, on three current-row masks. It supplies **no initial-value, final-value, or cross-row linkage constraints**. It is complete for that narrow per-row addition relation, not for a specified global Fibonacci computation, and certainly not for attendance. No secret-to-entry hash, depth-10 membership path, recipient/context binding, or deterministic nullifier is proved.

The [verifier](https://github.com/piotr-stec/stwo-verifier/blob/d27b6bd1089cd2d04e416119fdb6e2995cc02180/contracts/verifier/StwoVerifier.sol) visibly executes OODS equality, PoW, Merkle decommitment and FRI checks; this inspection is not a soundness audit of their implementation. Its external API accepts evaluator, component metadata, proof configuration, roots, and caller-initialized transcript. The [Poseidon evaluator](https://github.com/piotr-stec/stwo-verifier/blob/d27b6bd1089cd2d04e416119fdb6e2995cc02180/contracts/framework/PoseidonEval.sol) still explicitly skips hash constraints. Passing Fibonacci cannot repair that omission. The general proof parser also has unimplemented parsing paths; this structured embedded fixture does not test browser proof serialization.

## Negative-test evidence

Inspected existing tests for invalid/tampered/wrong-proof names, `assertFalse`, and `expectRevert`. No active end-to-end invalid-proof rejection case was identified in the Fibonacci fixture or adjacent framework/Merkle suites; `test/vcs/MerkleVerifierTest.sol` is commented out. Arithmetic divide-by-zero and container/config tests are not invalid STARK proof tests. No synthetic negative fixture was manufactured.

Ran the limited existing `PcsConfigTest.testConfigValidation` unchanged. It checks invalid bounds/query counts and fails because it expects `nQueries=10` to be rejected, whereas [PcsConfig.sol](https://github.com/piotr-stec/stwo-verifier/blob/d27b6bd1089cd2d04e416119fdb6e2995cc02180/contracts/pcs/PcsConfig.sol) accepts 1–200. Thus the fixture's three queries pass this range validator; the validator is not a security allowlist. Failure was preserved, not patched or retried. Other existing suites were not run.

## Artifact code sizes

Measured from `out/<source>/<contract>.json` bytecode hex length, excluding `0x`; link placeholders occupy the same 20 bytes as addresses. Init figures exclude constructor arguments; runtime includes metadata/immutable slots. These are compiler artifacts, not deployed-chain observations.

| Contract | Init bytes | Runtime bytes |
| --- | ---: | ---: |
| `STWOVerifier` | 48,099 | **48,073** |
| `FibonacciEval` | 4,849 | 4,655 |
| `FrameworkComponentLib` | 22,630 | 22,598 |
| `TraceLocationAllocatorLib` | 6,701 | 6,669 |
| `FibonacciFlowTest` (test harness only) | 35,560 | 35,508 |

Verifier links `FrameworkComponentLib` and `TraceLocationAllocatorLib`; the former also links the latter. **Verifier runtime alone exceeds EIP-170's 24,576-byte ceiling by 23,497 bytes**, before considering library deployment costs. Its 48,099-byte init is below the EIP-3860 49,152-byte ceiling, but that does not cure the runtime issue. No BSC limit compatibility or deployment was tested. No limit bypass was added to make this pass.

## Reproduction and evidence

After downloading and verifying the official binaries above:

```sh
git clone --no-checkout https://github.com/piotr-stec/stwo-verifier.git /tmp/opencode/stwo-smoke/source
cd /tmp/opencode/stwo-smoke/source
git checkout --detach d27b6bd1089cd2d04e416119fdb6e2995cc02180
git submodule update --init --recursive
export PATH=/tmp/opencode/stwo-smoke/bin:$PATH
export XDG_DATA_HOME=/tmp/opencode/stwo-smoke/data
export XDG_CACHE_HOME=/tmp/opencode/stwo-smoke/cache
# Verified solc resides at $XDG_DATA_HOME/svm/0.8.26/solc-0.8.26.
forge test --match-contract FibonacciFlowTest --match-test test_FibonacciFlowProofVerification -vv
# Separate, known-failing existing validation control:
forge test --use /tmp/opencode/stwo-smoke/solc/solc-0.8.26 --match-contract PcsConfigTest --match-test testConfigValidation -vv
forge config --json
```

Full unfiltered stdout/stderr, exit status and Bash wall/user/system timings are retained locally under **`/tmp/opencode/stwo-smoke/evidence/`**:

- `fixture.{stdout,stderr,exit,time}`: first actual exact command.
- `fixture-isolated.{stdout,stderr,exit,time}`: exact command with corrected isolation.
- `config-test.{stdout,stderr,exit,time}`: failing adjacent control.
- `config.json`, `sizes.txt`, `sizes-config.txt`, `versions.txt`, `environment.txt`, `log-checksums.txt`.
- Official release archive/checksum, `release-assets.html`, redirect headers, `solc-list.json`; the API request failed before saving JSON.
- Compiler artifacts: `/tmp/opencode/stwo-smoke/source/out/`; tool binaries: `/tmp/opencode/stwo-smoke/bin/`; compiler copies: isolated `solc/` and `data/svm/`.

These temporary artifacts are session-local, not committed durable attachments; rerun the commands if they have expired. Timings exclude clone/submodule and Foundry-download time (not separately timed). No browser, proof-generation, cold-proving-download, calldata, aggregate-memory, or on-chain deployment measurement was performed.

## Stop-gate decision

**The narrow positive interoperability control is reproduced. Stop before custom attendance work.** Request an upstream-supported pinned tuple with complete hash constraints, authenticated public-statement transcript initialization, justified ZK masking/fresh randomness, and compatible `wasm32-unknown-unknown` proof export. Also require ordinary-chain code-size feasibility and meaningful invalid-proof rejection tests; the existing config-test inconsistency needs upstream resolution, not local weakening.

Only after those gates should the prior report's tiny browser hash-preimage round trip, adversarial bindings, depth-10 attendance relation, and Chrome/Firefox budgets be attempted. This test establishes neither browser compatibility nor zero knowledge/unlinkability, real-wallet recovery, attendance semantics, secure soundness, BSC compatibility, or an approved gas ceiling. No production feature or cryptographic format is unblocked.
