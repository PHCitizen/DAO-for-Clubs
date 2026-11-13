# Poseidon2 T4 cross-runtime qualification

Date: 2026-11-13. **Evaluation only; no production hash mode, credential v2 format, parameters or deployment approved.**

## Outcome

**PASS: actual native Noir and Solidity execution agree on all four output lanes of 14 identical BN254 width-4 permutation vectors.** This is runtime evidence, not merely matching constants or comparing source. It qualifies these primitive implementations for further evaluation; it does not qualify an attendance hash/tree format or browser proof stack.

Unchanged implementation pins:

- `TaceoLabs/noir-poseidon`: `36c8db5a86795038822323dee790dd760372766d` (v0.6.2), local `/tmp/opencode/private-zk-noir-poseidon`.
- `TaceoLabs/poseidon2-solidity`: `4c599a08a45cd465a153d724425cee331c010df1`, local `/tmp/opencode/private-zk-poseidon-solidity`.
- Official Linux x86-64 Nargo **1.0.0-beta.26**, noirc `40d6574f851d926f93e0c3a271bac3e6e82ac905`, clean release; installed only under `/tmp/opencode/hash-vectors/bin`.
- Foundry **1.9.0**, commit `6056c5845d34205a83cf7108042adb137325c9df`, existing `/tmp/opencode/stwo-smoke/bin/forge`.
- Official solc **0.8.24+commit.e11b9ed9**, isolated binary; original upstream optimizer enabled, 200 runs, no changed security checks or fuzz count.
- Soldeer dependency **forge-std 1.16.2** exactly as upstream locked. `forge soldeer install` migrated lock syntax to v2 (added `version = 2`); the dependency URL, checksum and integrity stayed unchanged. Both locks are preserved in the evidence directory. No substitute dependency version was used.

Read repository engineering/domain guidance, `GLOSSARY.md`, and `private-browser-zk-evaluation.md`. There is no root `GLOSSARY-MAP.md` in this checkout. This work changes no attendance semantics and does not touch the other agent's ProveKit/Rust trees or toolchains.

## Executed checks

| Check | Actual result |
| --- | --- |
| Upstream Solidity T4 KAT suite | **5/5 passed**: 14 full-state permutation vectors, 10 compression vectors, checked range rejection and unchecked valid-input controls |
| Upstream Solidity T4 API suite | **7/7 passed**, including **10,000** fuzz cases comparing external/inline checked/unchecked compression, full external/inline permutation, and feed-forward relation |
| Upstream Noir Poseidon2 package | **7/7 passed**, including its T4 permutation test (other widths and upstream Merkle example are controls, not additional T4 interop claims) |
| Isolated generated Noir cross-vector harness | **14/14 passed**, each explicitly asserting all four output lanes against the Solidity KAT expected values |
| Additional isolated Solidity qualification tests | **2/2 passed**: maximum uint rejection and nonzero feed-forward distinction |

The 14 shared vectors were extracted losslessly as decimal BigInts from `test/Poseidon2T4_BN254.t.sol::test_permutation_matches_kats`, preserving order: `[0,1,2,3]`, ten upstream nontrivial vectors, `[0,0,0,0]`, `[p-1,p-1,p-1,p-1]`, and upstream intermediate-stress vector. Noir calls the pinned pure-arithmetic `poseidon2::bn254::permutation::t4`, not a backend Poseidon black box. Each generated test compares its complete `[Field;4]` result, not only lane zero. No expected values were regenerated from the implementation being tested. These finite vectors and Solidity API fuzz tests are not a proof of equivalence for every possible input.

Field prime:

```text
p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
```

Canonical-boundary results: upstream checked compression and permutation reject **p in every lane**, accept **p-1 in every lane**; inline checked APIs also reject p in every lane. The extra test rejects **2^256-1 in every lane** for checked array compression and permutation, expecting `NotInPrimefield`. Unchecked entrypoints were tested only on canonical inputs and are **not** safe parsing/rejection APIs. Noir `Field` arithmetic tests do not establish canonical byte/JSON decoder rejection; that separate boundary remains unqualified.

## Compression is not raw projection

For `input = [p-1,p-1,p-1,p-1]`, both runtimes' full-state KAT gives:

```text
permutation(input) = [
  0x1b18e6ca21a1e9b15d65f0b5861ede5ff20db8fa3722531823d0c817d69d945d,
  0x0afb50ea6867b1cb2d9d1eac935af746bc7a780e181a1e6ae9b768c9cba68878,
  0x0a521a22ca614e65b877d0676652fb60e90a11b462f9846a08e811d95272a9d8,
  0x2369f077784e0aea99ee3dc6b7b01612af7f80d7f08b755f9f116e2885ee367f
]
Solidity compress(input) =
  0x1b18e6ca21a1e9b15d65f0b5861ede5ff20db8fa3722531823d0c817d69d945c
```

The extra Solidity runtime test asserts `compress == addmod(permutation[0], input[0], p)`, `compress == permutation[0]-1`, and `compress != permutation[0]`. Thus modulo-p wraparound was exercised with a nonzero first lane. The upstream 10,000-case fuzz test independently asserts the feed-forward relation. Noir raw projection is **not interchangeable** with Solidity compression. No custom application hash mode was introduced.

## Measured local gas and sizes

These are **Forge test-function gas figures**, including test/consumer overhead, not transaction intrinsic gas, isolated opcode costs, BSC measurements or attendance-claim estimates:

| Upstream test | Gas |
| --- | ---: |
| external checked compression | 34,753 |
| external unchecked compression | 34,495 |
| inline checked compression | 31,031 |
| external permutation | 37,128 |
| external chain of 10 compressions | 274,110 |

`forge build --sizes` measured T4 library runtime **6,760 bytes**, initcode **6,813 bytes**; minimal linked consumer **337/366 bytes** runtime/initcode (library additional), minimal inline consumer **6,197/6,226 bytes**. Full external/inline API consumers were **1,085/6,575 runtime bytes**. The chain test is not a domain-separated depth-10 attendance membership claim. Local in-memory test contract creation was used by upstream tests; **no RPC deployment or broadcast occurred**. Lint warnings were retained.

## Evidence and reproduction

Temporary evidence root: `/tmp/opencode/hash-vectors` (preserve before environment expiry):

- `logs/{solidity-t4,solidity-extra,solidity-sizes,noir-upstream,noir-cross}.log`.
- `vectors.json`: all 14 input/output states as exact decimal strings.
- `extract.ts`: temporary TypeScript extractor/generator; `noir/{Nargo.toml,src/main.nr}`: generated tests.
- `CrossRuntimeQualification.t.sol`: additional test fixture, also present in the owned Solidity checkout's `test/` directory; production sources unchanged.
- `soldeer-original.lock`, `soldeer-resolved.lock`, `noir-release.json`, release archive and isolated binaries.

SHA-256:

```text
Nargo release archive  64048040befd55a987158b11137d8f38f9688f696db4d84910dd1bcf0442fb80
solc binary           fb03a29a517452b9f12bcf459ef37d0a543765bb3bbc911e70a87d6a37c30d5f
vectors.json          03369874cea9d314377df5956e7c45e60abfd0ddc9cbe090d943d27e74cbf7d6
original Soldeer lock fb2da105fef3f031a26c61d63da34313f4eb27f50a80e97abf116a6a8b89210e
resolved Soldeer lock c04e85d808884d78947415888c2429c0103fc66e050df03badb83f408194134e
```

Release URLs:

```text
https://github.com/noir-lang/noir/releases/download/v1.0.0-beta.26/nargo-x86_64-unknown-linux-gnu.tar.gz
https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v0.8.24+commit.e11b9ed9
```

Actual successful commands (run in indicated directory):

```sh
# /tmp/opencode/private-zk-poseidon-solidity
/tmp/opencode/stwo-smoke/bin/forge soldeer install
/tmp/opencode/stwo-smoke/bin/forge test --use /tmp/opencode/hash-vectors/bin/solc-0.8.24 --match-path 'test/Poseidon2T4*' -vv
/tmp/opencode/stwo-smoke/bin/forge test --use /tmp/opencode/hash-vectors/bin/solc-0.8.24 --match-contract CrossRuntimeQualification -vv
/tmp/opencode/stwo-smoke/bin/forge build --use /tmp/opencode/hash-vectors/bin/solc-0.8.24 --sizes
# /tmp/opencode/private-zk-noir-poseidon/poseidon2
/tmp/opencode/hash-vectors/bin/nargo test
# any directory; extractor uses the absolute pinned checkout paths
pnpm dlx tsx@4.21.0 /tmp/opencode/hash-vectors/extract.ts
/tmp/opencode/hash-vectors/bin/nargo test --program-dir /tmp/opencode/hash-vectors/noir
```

To regenerate without the temporary generator: translate each of the 14 `_check(input, expected)` calls in the pinned Solidity KAT into a Noir `#[test]` calling `t4(input)` and asserting all four lanes equal `expected`; use a local dependency on the pinned `poseidon2` package. The generated manifest uses the upstream-compatible requirement `compiler_version = ">=0.36.0"`; the explicitly invoked executable pins beta.26. An initial attempt to specify the prerelease in this manifest was rejected because Nargo permits only full releases in that requirement. Correcting the harness metadata did not change the compiler or implementation. An initial `nargo test` from the repository root failed because that root has no Nargo package; the package-directory command above passed. No source patch or weakened check was used to make a test pass.

## Remaining boundaries

No primitive-runtime blocker remains for this exact finite-vector set. This does **not** establish browser/NoirJS execution, ProveKit proving/verification, cryptographic audit status, circuit constraint cost, canonical byte parsing, a sponge specification, credential recovery/entry/leaf/node/empty domains, depth-10 tree semantics, or an ordinary public attendance claim's gas. Those require separate approved interfaces and vectors. Keep v1 frozen; do not freeze v2 parameters or treat this report as format approval. The libraries remain candidates, with the Solidity project's unaudited status unchanged.
