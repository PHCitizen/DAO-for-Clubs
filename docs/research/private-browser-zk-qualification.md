# ProveKit v1.0.2 executable qualification

Date: 2026-11-13. Isolated qualification only; no production approval.

## Outcome and scope

Subsequent user decision: support **Chrome only**. Native↔Chrome interchange and Firefox are not required product gates. The failures below remain evidence and must not be called passes, but do not alone disqualify a pinned Chrome-only configuration. Real attendance constraints, budgets, privacy/security review (including the retained verifier warnings), and format approval remain outstanding. Feature 07's format prerequisite is now separated into `todos/02-attendance-format-agreement.md`.

**Native and Chrome self-round trips pass; native↔Chrome interoperability fails in both directions. Do not qualify this tuple for production.** This is an executed result from exact-source ProveKit v1.0.2, not the old SDK loader. Both verifiers reject the other runtime's otherwise valid proof at `while verifying sumcheck: Sumcheck equality assertion failed`. Positive controls and meaningful tamper/public-output negatives pass within each runtime. No crypto code, parameters, lockfiles, or checks were patched.

The first execution was interrupted by temporary-directory loss: on resume, `/tmp/opencode` was empty and no Cargo, Rust, browser, or harness processes from that execution remained. Its native build and wasm-bindgen build had started, but neither had a recorded completion. They are not counted as successful builds or proofs. The first execution's transient logs are lost; completed qualification below was rerun from restored pinned inputs. System libraries and Chrome cache survived.

Read the repository engineering/domain instructions, `GLOSSARY.md`, `project.md`, TODO-01, private-presentation feature spec, and `private-browser-zk-evaluation.md`. Private proofs remain browser-local, transparent, witness-hiding presentations; public claims disclose secrets/paths and use ordinary hashing. This control is only `(5+3)*(5-3)=16`, not attendance or depth-10 membership. No recursive wrapper, Groth16, KZG, deployment, production code, or credential-format change is included. The separate `poseidon2-cross-runtime-qualification.md` owns the hash-vector work.

## Pinned inputs

- ProveKit v1.0.2, source commit `4ee40639fb8849aeeba37761fdda07f28367e81d`.
- Unmodified upstream Cargo lock SHA-256: `64371d15c0ac3efb7521937ff56a0f9d071b05b7e4965c836b67ef70ee9c02db`.
- `nightly-2026-03-04`, rustc `1.96.0-nightly (d9563937f 2026-03-03)`; isolated Cargo/Rustup homes, `rust-src`, `wasm32-unknown-unknown`, no profile/PATH-file edits.
- Native compiler crates and browser NoirJS/ACVM: `1.0.0-beta.26`, not the beta.11/old Verity SDK.
- Matching wasm-bindgen CLI `0.2.113`; official HTTPS release asset `wasm-bindgen-0.2.113-x86_64-unknown-linux-musl.tar.gz`, SHA-256 `0366bf5936d5e2578b06fc318a5696ddecfb66382e671e51f469b83f3494712f`. This hash records downloaded bytes, not independent release-signature verification.
- Chrome for Testing `157.0.8103.78`, agent-browser `0.43.0`; Firefox not tested.
- TypeScript harness: tsx `4.21.0`, esbuild `0.25.12`, Node `v24.22.2`; temporary pnpm workspace approves only esbuild install scripts. Initial pnpm install reported ignored esbuild build scripts; after explicit allow-list approval, frozen-lockfile install and bundling passed. Browser invocations report pnpm `12.16.1`; final global `pnpm -v` reported `12.18.0`. Harness lock SHA-256: `1a80366c1d36b463668af0369a27a278e0521b687f352c28ba0c6436d9d65b00`.

## Environment repair: completed

`sudo -n true` succeeded. Reviewed `agent-browser install --help`: `--with-deps` is supported and invokes the system package manager as root/sudo. Used a narrower reviewed apt dependency list instead of an opaque full installer. No broad upgrade or disabled TLS/cryptographic check was used.

```sh
sudo -n apt-get update
sudo -n apt-get -s install --no-install-recommends --no-upgrade \
  libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libxkbcommon0 \
  libasound2t64 libgbm1 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libatspi2.0-0t64
sudo -n apt-get install -y --no-install-recommends --no-upgrade \
  libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libxkbcommon0 \
  libasound2t64 libgbm1 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libatspi2.0-0t64
```

First run: 34 new dependency packages, zero upgrades/removals; Mesa/LLVM userspace dependencies came with `libgbm1`, no GPU driver or kernel change. Separately installed `time` and Binaryen `108` (two new packages, zero upgrades). These OS libraries survived the temporary-directory reset. On resume, `ldd` reported no missing Chrome dependencies and apt simulation reported `0 upgraded, 0 newly installed, 0 to remove and 32 not upgraded` for these packages plus time/Binaryen.

The first run's **old Verity loader-only control** returned:

```json
{"status":"loader-only-pass","isolated":true,"threads":2,"elapsedMs":143.464999999851,"invalidVerifierRejected":true}
```

This initialized old WASM and workers and rejected a malformed verifier; it **did not generate or verify a v1.0.2 proof**. The old package was not combined with the selected source. Its temporary server/file is gone after reset.

On resume the first agent-browser open returned `Resource temporarily unavailable (os error 11)` with ambiguous execution status. Ran `doctor`, not destructive `doctor --fix`: actual output was **8 pass, 1 warn, 0 fail**, headless `about:blank` launch **3.75 s**. Only warning: optional ffmpeg absent. The CLI's default container launch includes `--no-sandbox` and software rendering flags; this is a localhost disposable functional control, not hardened browser deployment evidence. No certificate validation or proof checks were disabled.

## Completed native and WASM execution

Source/harness/tooling are isolated under `/tmp/opencode/private-zk-{provekit,rust,qualification,evidence}`. The temporary TypeScript harness used two Cargo jobs, two Rayon threads, unchanged release configuration, 20-minute build limits, a 25-minute queued prepare limit, and five-minute proof-operation limits. A native build was started once; queued `cargo run` waited on Cargo's build lock rather than compiling a duplicate build. Dependencies resolved under `--locked`. `git diff` in the source checkout is empty; only generated WASM `pkg/` is untracked.

Hardware: shared Codespaces Linux `6.8.0-1070-azure`, AMD EPYC 7763, four exposed logical CPUs, approximately 15 GiB RAM, no swap. Cgroup memory and CPU limits report `max`; this is not a controlled consumer desktop. Build resources were bounded by concurrency and command timeouts, not a claimed 1-GiB browser memory cap.

```sh
export CARGO_HOME=/tmp/opencode/private-zk-rust/cargo
export RUSTUP_HOME=/tmp/opencode/private-zk-rust/rustup
export PATH="$CARGO_HOME/bin:$PATH"
export CARGO_BUILD_JOBS=2 RAYON_NUM_THREADS=2
cd /tmp/opencode/private-zk-provekit/noir-examples/basic-4
cargo run --locked --release --bin provekit-cli -- prepare
cargo run --locked --release --bin provekit-cli -- prove
cargo run --locked --release --bin provekit-cli -- verify
# JSON transport is supported by the unchanged native file interface:
cargo run --locked --release --bin provekit-cli -- prove --out native-proof.json
cargo run --locked --release --bin provekit-cli -- verify --proof native-proof.json
cd ../..
cargo build --locked --release --target wasm32-unknown-unknown \
  -p provekit-wasm -Z build-std=panic_abort,std
wasm-bindgen --target web --out-dir tooling/provekit-wasm/pkg \
  target/wasm32-unknown-unknown/release/provekit_wasm.wasm
cd tooling/provekit-wasm/pkg
wasm-opt -O3 --enable-simd --enable-threads --enable-bulk-memory \
  --enable-mutable-globals --enable-nontrapping-float-to-int --enable-sign-ext \
  --fast-math --low-memory-unused -o provekit_wasm_bg.wasm provekit_wasm_bg.wasm
```

All commands above completed with exit 0. Binaryen `108` accepted the documented command unchanged, including `--fast-math`; that is an upstream optimizer flag, not relaxed proof validation. The upstream CLI builds its `provekit-gnark` export-helper dependency, but no gnark/Go prover, recursive proof, Groth16 key/setup or proof, remote verifier, or deployment was executed.

| Operation | Measured wall time | GNU time maximum RSS | Result |
| --- | ---: | ---: | --- |
| Cold native release build | 524.290 s (Bash time) | Not captured | Exit 0 |
| Queued native prepare | 383.35 s, includes waiting for active build | 130,340 KiB | Exit 0; **not preparation-only timing** |
| Native prove to `.np`, Cargo-inclusive | 0.54 s | 130,252 KiB | Exit 0 |
| Native verify `.np`, Cargo-inclusive | 0.46 s | 130,888 KiB | Exit 0 |
| Native prove to JSON, Cargo-inclusive | 0.53 s | 130,380 KiB | Exit 0 |
| Native verify JSON, Cargo-inclusive | 0.90 s | 130,508 KiB | Exit 0 |
| Same-source WASM release build | 130.55 s | 793,572 KiB | Exit 0 |
| wasm-bindgen | 0.60 s | 159,844 KiB | Exit 0 |
| wasm-opt | 14.58 s | 289,992 KiB | Exit 0 |

RSS values are tool-process measurements, not aggregate browser/worker memory. Cargo-inclusive numbers include Cargo's approximately 130-MiB process, not merely proof computation. Native allocator tracing separately reports `prove` 96.2 ms and command `run` 98.4 ms, 9.52 MB tracked allocation peak; this is not RSS or a browser memory measurement.

## Actual Chrome proof and rejection tests

Browser harness uses beta.26 NoirJS/ACVM, native `.pkp`/`.pkv`, direct same-source bindings, and COOP/COEP localhost serving. Circuit is **3 R1CS constraints and 6 witnesses**, with inputs `a=5,b=3` and public return `0x10`. The unchanged backend still pads to its minimum WHIR size. No attendance secret or application dataset was used.

Initial same-source page timed out at 120 s in worker initialization. Root cause was in the temporary static server: `wasm-bindgen-rayon`'s generated helper dynamically imports `../../..`, resolving to `/pkg/`; server tried to read a directory and returned 404 (`EISDIR`). Added a server alias `/pkg/ → pkg/provekit_wasm.js`. No generated module, Rust source, crypto, or dependency was modified. The next navigation completed all browser checks in about one second. This route is necessary for the unbundled generated package used here.

| Check | Actual result |
| --- | --- |
| Native proof → native verifier (`.np` and JSON) | PASS |
| Browser proof → browser verifier | PASS |
| Native proof → browser verifier, same native `.pkv` | **FAIL: sumcheck equality assertion** |
| Browser JSON proof → native verifier, same `.pkv` | **FAIL: sumcheck equality assertion**, CLI exit 1 |
| Native-valid proof, public output changed canonically from 16 to 17 → native | Rejected at sumcheck equality, exit 1 |
| Native-valid proof, first transcript hex nibble changed → native | Rejected at sumcheck equality, exit 1 |
| Browser-valid proof, public output changed canonically from 16 to 17 → browser | Rejected at sumcheck equality |
| Browser-valid proof, first transcript hex nibble changed → browser | Rejected at sumcheck equality |
| Mutated browser proofs → native | Also rejected, **not independent negative evidence** because untouched browser proof already fails there |

The public mutation preserves canonical 32-byte little-endian field encoding: `1000…00 → 1100…00`. The transcript mutation preserves JSON shape and hex length. Rejections reach cryptographic sumcheck checking, not JSON/field parsing errors.

Browser result (one successful functional trial, **not a cold/warm benchmark**):

```json
{
  "stage": "done",
  "isolated": true,
  "initMs": 87.40500000002794,
  "nativeToBrowser": {"accepted": false, "error": "Error: while verifying sumcheck: Sumcheck equality assertion failed"},
  "constraints": 3,
  "witnesses": 6,
  "witnessMs": 63.46999999997206,
  "returnValue": "0x10",
  "proveMs": 446.7849999999162,
  "proofBytes": 380394,
  "browserRoundtrip": {"accepted": true},
  "verifyMs": 75.28500000014901,
  "publicInputs": ["1000000000000000000000000000000000000000000000000000000000000000"],
  "alteredPublicOutput": {"accepted": false, "error": "Error: while verifying sumcheck: Sumcheck equality assertion failed"},
  "tamperedTranscript": {"accepted": false, "error": "Error: while verifying sumcheck: Sumcheck equality assertion failed"},
  "totalMs": 981.410000000149
}
```

Timing includes two-worker initialization, local key fetches, native-proof rejection, witness generation, proving, self-verification, rejection tests and local proof POSTs. It does not include HTML/bundle loading before the script timer, dataset parsing, path construction or chain access. Re-navigation after a failed worker-load trial may reuse cached resources; do not label this cold.

Native cross-runtime failure excerpt, after successful key/proof decoding and commitment reception:

```text
read_json path="/tmp/opencode/private-zk-evidence/browser-proof.json" size=380394
provekit_verifier::whir_r1cs::run_sumcheck_verifier
Error: While verifying Noir proof
Caused by:
    0: while verifying sumcheck
    1: Sumcheck equality assertion failed
Exit status: 1
```

The failure is therefore **not now missing browser libraries, unsupported WASM, wrong SDK revision, or file-format parsing**. Its exact algebraic/transcript root cause has not been established; do not claim a proven platform-width or entropy cause. It reproduces the upstream-documented compatibility issue.

## Artifact sizes and download limits

Exact on-disk bytes; gzip is independently computed level-9 compression, **not measured network transfer**. `.pkp` already uses XZ and `.pkv` Zstd; re-gzipping them slightly grows them.

| Artifact | Bytes | gzip bytes |
| --- | ---: | ---: |
| ProveKit optimized WASM | 2,642,203 | 798,436 |
| Generated main JS | 31,011 | 6,474 |
| Rayon worker helper JS | 4,546 | 2,130 |
| Test bundle including NoirJS/ACVM/ABI JS | 112,606 | 23,734 |
| ACVM beta.26 WASM | 3,050,737 | 852,327 |
| Noir ABI beta.26 WASM | 658,569 | 258,471 |
| `basic.pkp` | 664 | 687 |
| `basic.pkv` | 600 | 623 |
| **Unique runtime files + keys above** | **6,500,936** | **1,942,882** |
| Compiled ACIR JSON, not separately fetched (embedded in `.pkp`) | 1,264 | 882 |
| Native `.np` proof | 284,373 | 282,140 |
| Native JSON proof | 379,658 | 285,390 |
| Browser JSON proof | 380,394 | 285,439 |

The runtime/key inventory excludes HTML/HTTP overhead and the native proof downloaded only for the interoperability control. The `/pkg/` alias can fetch identical JS under a second URL; unique-byte inventory is not a HAR/download benchmark. There is no external circuit/witness artifact missing from this tiny relation's keys, but this inventory cannot predict an attendance circuit's keys. Proof export is not part of proving-artifact downloads. No 50-MiB attendance gate is passed.

SHA-256 identifiers:

```text
ProveKit WASM  6709206363148b8fca2ee1959ec52900c0889dfd49b8f8e9a14e61182342531f
main JS        9282fd7988ab2fee04aeac909815c53b3d5450f1c7de8abc03b5ba26198c6005
worker JS      6982a7a006a69849d666aaf4ac7ea07a42931f850c31006782b1937fd5704f96
ACVM WASM      c982c452f91142e3f01a6ce5a9ecd652d48fff7ab644e4343c8130a29e82785a
ABI WASM       8691ec541313f1489670b05c93ed9791aaf897c547579d0d4a77e0678b08185c
basic.pkp      cd8504aed380297c99e40d1b0a64fc498b9746042f7c992fe76ff4ff20b67f66
basic.pkv      2c7c5935a223d966d1d0269e3e35b2958b5feaf0aac5ee6ace37404da8583bed
native .np     e1f070d8bbbc36667f76fd8e3b2bc75acbfddb4ad149e79d3dd7e8d042c69e3f
native JSON    19bd04d01fb7f5eafc4a3969af0549679543cba861ca2e4c3374f6501bfc6a07
browser JSON   4d4e3ee84b6a35e952380bafe86aaa5c15a0202fbdc55e43530a3b9f2af96cd8
```

Decisive log excerpts, commands, stage timings, source/dependency lock identifiers, browser result, and the browser recipe are preserved in this report. Full raw logs and harness are additionally bundled at `/tmp/opencode/private-zk-evidence/qualification-evidence.tar.gz`: **50,996 bytes**, SHA-256 `251f90b208beaecaf647c9d11382bf2a797077d6aea44faa43f384e38b5a6ed1` (42 entries: logs, structured results/manifest, pnpm lock/workspace, TypeScript harness, keys and circuit). This temporary archive is not a durable repository attachment and will be lost if `/tmp` is cleared again. Proof files themselves also remain temporary; their hashes and measured sizes are recorded here. No extra repository evidence files were added. Build outputs are reproducible inputs to investigation, not approved application artifacts.

## Security assumptions and acceptance boundary

Upstream's base scheme uses ZK WHIR and blinded outer sumcheck; public preprocessing is not a trusted setup ceremony. This is source-based construction evidence, not a cryptographic audit. Default compiler configuration targets 128-bit security under the Johnson bound, with `pow_bits=10`, minimum WHIR variables 14, folding factors 3, starting inverse-rate log 2, batch size 1, SHA2 transcript hash; these parameters are not weakened for the tiny control.

**Additional security-review concern:** the unchanged native build emits three `unused FinalClaim that must be used` warnings in `provekit/verifier/src/whir_r1cs.rs:181,192,234`, with the diagnostic `The final claim must be checked if there where any linear forms.` These warnings were retained, not suppressed or patched. Passing limited negatives is not a completeness/soundness audit; upstream must explain/discharge the final-claim obligations as well as interoperability before production consideration. This report does not assert an exploitable verifier bypass from warnings alone.

Successful functional verification would not establish unlinkability, all browser entropy paths, side-channel resistance, witness/log leakage, or an authenticated attendance statement. The app must trust approved verifier artifacts and independently bind chain/DAO/event/finalized root; a proof's own public output is not an authenticated expected value. Browser CSPRNG masks must be fresh; differing proof bytes alone do not prove privacy.

**Chrome and Firefox attendance targets of 60 seconds, 1 GiB aggregate peak memory, and 50 MiB complete proving downloads remain unverified.** No depth-10 attendance relation, cold/warm multi-trial benchmark, Firefox measurement, aggregate memory measurement, authenticated chain root, or production readiness has been demonstrated. No production ticket is unblocked.

## Precise next step

Take the pinned source, shared `basic.pkp`/`basic.pkv`, and the two positive-runtime proof files to upstream. Reproduce: native JSON verifies natively but fails WASM; WASM JSON verifies in Chrome but fails natively; both fail at outer sumcheck equality, not parsing. Request a supported same-revision transcript/configuration fix and explanation of the three final-claim warnings. Do not patch cryptography merely to pass. If upstream supplies an approved revision, pin it as a new tuple and rerun these tiny positive/negative/interoperability controls before any secret-preimage or depth-10 attendance benchmark. Then audit entropy/privacy and independently measure Chrome/Firefox budgets.

## Reproduction and retained log identifiers

Native preparation emits the package's name `basic.pkp`/`basic.pkv`, not directory-derived `basic-4` filenames. Witness values remain the source `Prover.toml` (`a="5"`, `b="3"`). To reproduce the browser half, pin these temporary pnpm dependencies:

```json
{"private":true,"type":"module","dependencies":{"@noir-lang/noir_js":"1.0.0-beta.26","@noir-lang/acvm_js":"1.0.0-beta.26","esbuild":"0.25.12","tsx":"4.21.0"}}
```

Use a one-package pnpm workspace and `allowBuilds: { esbuild: true }`; install/freeze the pnpm lock before running. Bundle the following TypeScript as browser ESM, leaving `/pkg/*` external:

```sh
pnpm exec esbuild browser.ts --bundle --format=esm --platform=browser \
  --external:/pkg/* --outfile=browser.js
```

Copy the **web** ACVM and ABI `.wasm` files from their beta.26 packages beside `browser.js`; bundled glue resolves them relative to `import.meta.url`. Serve local files with `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, correct JS/WASM content types, and the `/pkg/` main-module alias described above. Map `/artifacts/` to the prepared example and `/pkg/` files to the same-source generated package. The core exercised API sequence is:

```typescript
import { Noir } from '@noir-lang/noir_js';
import { decompressWitnessStack } from '@noir-lang/acvm_js';
const m = await import('/pkg/provekit_wasm.js');
await m.default();
m.initPanicHook();
await m.initThreadPool(2);
const bytes = async (p: string) => new Uint8Array(await (await fetch(p)).arrayBuffer());
const verifier = new m.Verifier(await bytes('/artifacts/basic.pkv'));
// Actual run caught/recorded this failure, then continued with browser proof.
try { verifier.verifyBytes(await bytes('/artifacts/native-proof.json')); }
catch (error) { console.log(String(error)); }
const prover = new m.Prover(await bytes('/artifacts/basic.pkp'));
const circuit = JSON.parse(new TextDecoder().decode(prover.getCircuit()));
const { witness } = await new Noir(circuit).execute({ a: '5', b: '3' });
const proof = prover.proveBytes(decompressWitnessStack(witness)[0].witness);
verifier.verifyBytes(proof); // Must succeed before negative tests.
// Actual harness exported proof bytes unchanged to browser-proof.json.
const changed = JSON.parse(new TextDecoder().decode(proof));
changed.public_inputs[0] = '11' + '00'.repeat(31); // output 17, canonical
try { verifier.verifyBytes(new TextEncoder().encode(JSON.stringify(changed))); }
catch (error) { console.log(String(error)); } // Require rejection, not just logging.
const tampered = JSON.parse(new TextDecoder().decode(proof));
const hex = tampered.whir_r1cs_proof.narg_string;
tampered.whir_r1cs_proof.narg_string = (hex[0] === '0' ? '1' : '0') + hex.slice(1);
try { verifier.verifyBytes(new TextEncoder().encode(JSON.stringify(tampered))); }
catch (error) { console.log(String(error)); } // Require rejection.
```

The actual harness recorded booleans/errors for each check, POSTed proof/results to the local evidence server, and did not classify missing exceptions as successful negatives. Browser automation used the loaded agent-browser skill and isolated session:

```sh
pnpm dlx agent-browser@0.43.0 --session qualification-005a3a02bd41 \
  open http://127.0.0.1:4320
AGENT_BROWSER_DEFAULT_TIMEOUT=120000 pnpm dlx agent-browser@0.43.0 \
  --session qualification-005a3a02bd41 wait \
  --fn "window.qualification && ['done','failed'].includes(window.qualification.stage)"
pnpm dlx agent-browser@0.43.0 --session qualification-005a3a02bd41 get text '#result'
cd /tmp/opencode/private-zk-provekit/noir-examples/basic-4
RAYON_NUM_THREADS=2 ../../target/release/provekit-cli verify \
  --verifier basic.pkv --proof /tmp/opencode/private-zk-evidence/browser-proof.json
# Expected observed exit: 1, sumcheck equality assertion (interop failure).
```

Native negatives use the same two JSON mutations on `native-proof.json`, then the native CLI with the same `basic.pkv`; both exit 1 at sumcheck after the unmodified native proof passes. Thus they are not merely cross-runtime failures relabelled as negative controls.

Preserved command-completion log excerpt:

```text
native release: Finished `release` profile [optimized] target(s) in 8m 44s
real 8m44.290s; user 11m59.991s; sys 0m49.962s
native prepare: exit 0, elapsedMs 383361 (queued build wait included)
native prove: exit 0, elapsedMs 550
native verify: exit 0, elapsedMs 468
native prove JSON: exit 0, elapsedMs 537
native verify JSON: exit 0, elapsedMs 909
WASM build: exit 0, elapsedMs 130556
wasm-bindgen: exit 0, elapsedMs 613
wasm-opt: exit 0, elapsedMs 14594
browser wait after server route repair: true
browser positive: accepted=true
browser native-proof check: accepted=false, sumcheck equality assertion
browser altered-public / tampered-transcript: accepted=false, sumcheck equality assertion
native browser-proof check: exit=1, elapsedMs=437, sumcheck equality assertion
native native-proof altered-public: exit=1, sumcheck equality assertion
native native-proof tampered-transcript: exit=1, sumcheck equality assertion
```

Raw log SHA-256s (under `/tmp/opencode/private-zk-evidence/`; full manifest in archive):

```text
native-build.log      fff764444593649099c293ca5bc72a8fd3623a009d8e26c632817a41856e92fe
native-prepare.log    d86f5ea5dd52f691548981a7842d9ad8fc1149e82e41305442386be27ea8436c
native-prove.log      e7bdbf48b791e41a8047069c2e31e27949035a79980e8838e72ab85020dc9baf
native-verify.log     22810be38ff9dd682faa73ba2638c04344627581d0bb550f2b8beefac3524738
native-prove-json.log ee19090402a335d880810d0ac7b12ea579e85f02f278596954664a699f940d2f
native-verify-json.log 2cfdf26bbf05aef0b313181d30de0887d00a4de5456bfbe90145c5e3e7bba387
wasm-build.log        6590dbca83ad4f23eb282156a044b8a2daac0314389702487c3215a274e07fad
wasm-bindgen.log      72b720c15f7f3ef020f17a98fee0bcedd4198f3f910c307cb0bcc5ad5fa36e5d
wasm-opt.log          b09090f46604899242616b1069c06eff5717c05016751d820a4bcbc66f602c2b
browser-read.log      e69147185e6e225a9339a8ea2b1df1614a7b25d74a2fa0019332676ba30359cc
native-verify-browser-proof.log a8df3dec7218d83280e222a6190f5de4432bd7c3c95fc677cdf809002b667b1e
native-altered-public.log ed0bce2eba4502678c538a9d52f585ef7ba618c7b4b77733f8de94bcb0a9bbe8
native-tampered-transcript.log 416ca54ca5175dc8f3f598eabdf74c9abb6d559ab2065128cb6efe5f1c5ce5dd
```
