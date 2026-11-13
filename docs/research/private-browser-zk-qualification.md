# ProveKit v1.0.2 executable qualification

Date: 2026-11-13. Isolated qualification only; no production approval.

## Checkpoint and scope

**Qualification is not yet established.** The first execution was interrupted by an environment reset: on resume, `/tmp/opencode` was empty and no Cargo, Rust, browser, or harness processes from that execution remained. Its native build and wasm-bindgen build had started, but neither had a recorded completion. They must not be counted as successful builds or proofs. The first execution's transient logs are lost; the observations below distinguish that run from reconstructed evidence.

Read the repository engineering/domain instructions, `GLOSSARY.md`, `project.md`, TODO-01, private-presentation feature spec, and `private-browser-zk-evaluation.md`. Private proofs remain browser-local, transparent, witness-hiding presentations; public claims disclose secrets/paths and use ordinary hashing. This control is only `(5+3)*(5-3)=16`, not attendance or depth-10 membership. No recursive wrapper, Groth16, KZG, deployment, production code, or credential-format change is included. The separate `poseidon2-cross-runtime-qualification.md` owns the hash-vector work.

## Pinned inputs

- ProveKit v1.0.2, source commit `4ee40639fb8849aeeba37761fdda07f28367e81d`.
- Unmodified upstream Cargo lock SHA-256: `64371d15c0ac3efb7521937ff56a0f9d071b05b7e4965c836b67ef70ee9c02db`.
- `nightly-2026-03-04`, rustc `1.96.0-nightly (d9563937f 2026-03-03)`; isolated Cargo/Rustup homes, `rust-src`, `wasm32-unknown-unknown`, no profile/PATH-file edits.
- Native compiler crates and browser NoirJS/ACVM: `1.0.0-beta.26`, not the beta.11/old Verity SDK.
- Matching wasm-bindgen CLI `0.2.113`; official HTTPS release asset `wasm-bindgen-0.2.113-x86_64-unknown-linux-musl.tar.gz`, SHA-256 `0366bf5936d5e2578b06fc318a5696ddecfb66382e671e51f469b83f3494712f`. This hash records downloaded bytes, not independent release-signature verification.
- Chrome for Testing `157.0.8103.78`, agent-browser `0.43.0`; Firefox not tested.

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

## Reconstructed execution and evidence

Source/harness/tooling are isolated under `/tmp/opencode/private-zk-{provekit,rust,qualification,evidence}`. The temporary TypeScript harness uses two Cargo jobs, two Rayon threads, unchanged release configuration, 20-minute per-build timeouts and five-minute proof-operation timeouts. A native build was started once; the queued `cargo run` waits on Cargo's build lock rather than compiling a duplicate build. Rustup source dependencies resolve under `--locked`.

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
```

Browser harness uses beta.26 NoirJS/ACVM, native `.pkp`/`.pkv`, direct same-source bindings, and COOP/COEP localhost serving. It first attempts native JSON proof verification, generates witness/proof in Chrome, verifies its own proof, exports JSON for native verification, and tests a modified transcript and canonical public output `16 → 17`. Its result must distinguish rejection after cryptographic checking from malformed-input parsing and from not-executed tests. Unsupported interoperability must not be repaired by changing cryptographic configuration or mixing versions.

Resume evidence files currently include source clone/install/build logs, apt simulation, browser doctor/launch output, and the downloaded bindgen asset. Final measured outcomes will replace this checkpoint when the bounded execution completes. Temporary raw logs alone are not durable evidence; relevant final results/errors belong in this report.

## Security assumptions and acceptance boundary

Upstream's base scheme uses ZK WHIR and blinded outer sumcheck; public preprocessing is not a trusted setup ceremony. This is source-based construction evidence, not a cryptographic audit. Default compiler configuration targets 128-bit security under the Johnson bound, with `pow_bits=10`, minimum WHIR variables 14, folding factors 3, starting inverse-rate log 2, batch size 1, SHA2 transcript hash; these parameters are not weakened for the tiny control.

Successful functional verification would not establish unlinkability, all browser entropy paths, side-channel resistance, witness/log leakage, or an authenticated attendance statement. The app must trust approved verifier artifacts and independently bind chain/DAO/event/finalized root; a proof's own public output is not an authenticated expected value. Browser CSPRNG masks must be fresh; differing proof bytes alone do not prove privacy.

**Chrome and Firefox attendance targets of 60 seconds, 1 GiB aggregate peak memory, and 50 MiB complete proving downloads remain unverified.** No depth-10 attendance relation, cold/warm multi-trial benchmark, Firefox measurement, aggregate memory measurement, authenticated chain root, or production readiness has been demonstrated by this checkpoint. No production ticket is unblocked.
