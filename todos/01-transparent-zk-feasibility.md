# TODO-01: Validate transparent attendance proofs

Status: ready-for-agent
Type: research
Execution: authorized by the user on 2026-11-13; investigation in progress. Production implementation and format approval remain gated.

## Purpose

**Format approval recorded:** The user approved the exact minimal POC agreement in `docs/attendance-format-v2-proposal.md`. TODO-02 is resolved and feature 07's shared-format gate is cleared. Continue this investigation for private Chrome ZK security/privacy/performance and verifier artifacts; do not treat its unfinished qualification as a publication-format blocker.

**Latest scope:** Chrome only; Firefox and native↔Chrome proof interchange are not acceptance requirements. Native/Chrome incompatibility remains documented but is not itself a blocker for a pinned Chrome-only verifier configuration. Verifier security warnings, real attendance constraints, privacy, and measured budgets remain unresolved. Feature 07's shared-format gate is tracked separately in [TODO-02](02-attendance-format-agreement.md); it does not wait for completion of private-proof qualification.

**Current scope revision (user confirmed):** ZK is required only for private off-chain presentations. Public claims reveal the secret and Merkle path and use ordinary on-chain hash/membership checks. Consuming an entry prevents later duplicate public claims, but copying the credential for private proofs and front-running the first public claim are accepted POC weaknesses. This revision supersedes the earlier on-chain ZK, secret-hiding public claim, and constrained public-claim-nullifier requirements below. Earlier gates and research results must be read with this revision.

Select and benchmark a transparent proof system for the agreed attendance credentials before proof-dependent implementation commits to a cryptographic format. This is an engineering feasibility investigation, not permission to change the product requirements.

## Requirements to preserve

- No trusted setup ceremony, including a hidden dependency on a trusted setup in a recursive wrapper or on-chain verifier.
- Browser-side proof generation without an application backend.
- Private off-chain verification against an authenticated attendance root read from BNB Smart Chain testnet.
- An opt-in public claim verified on-chain, bound to the claiming wallet, without revealing the attendance secret.
- One public claim per attendance credential, enforced with a per-credential nullifier.
- Event/deployment separation, transferable credentials, and organizer-attested attendance.
- Versioned, reproducible credential derivation. The user approved replacing SHA-256 credential hashing with a prover-appropriate hash in a new credential version; existing v1 semantics must not be silently reinterpreted.

## Investigation

- Compare primary-source documentation and working implementations for candidate transparent systems.
- Identify every setup assumption throughout the complete proving and verification pipeline.
- Test browser compatibility, required WASM/workers, artifact sizes, memory, and proving/verification time on documented hardware and browsers.
- Measure on-chain verification gas, calldata size, deployment size, and actual compatibility with BNB Smart Chain testnet constraints.
- Exercise the real attendance statement: knowledge of a secret yielding a published QR entry and Merkle membership in the event's finalized root.
- Exercise the public-claim statement with wallet binding, event/deployment separation, and a constrained nullifier. Check wrong recipient, altered event/root, proof replay, and duplicate-credential claims.
- Specify canonical Merkle hashing, leaf ordering, duplicate treatment, odd-leaf behavior, empty-set handling, maximum supported attendance size, and membership-path encoding.
- Specify versioned proof artifacts, public inputs, verification-key identification, and how private presentations avoid leaking a stable entry identifier.
- Establish reproducible vectors shared by browser generation, off-chain verification, and the on-chain verifier.

## Deliverables

- Evidence-backed recommendation with alternatives and setup assumptions.
- Reproducible benchmark commands and measured results, not estimated performance claims.
- A supported proof configuration and concrete limitations, or an explicit finding that the current requirements are not feasible within the POC constraints.
- A versioned cryptographic format agreement usable by attendance publication and both proof features.
- An explicit list of implementation tickets unblocked by the result.

## Current acceptance gates after public-claim simplification

- Find and benchmark a genuinely ZK, transparent browser prover and off-chain verifier; a matching Solidity ZK verifier is no longer a selection requirement. Existing Chrome/Firefox, 1,024-entry, 60-second, 1-GiB, 50-MiB targets remain.
- Retain approved verification configurations, fresh-private-proof unlinkability, authenticated finalized roots, domain separation, and final cryptographic format approval.
- Select v2 entry and Merkle hashing with consistent browser/circuit/Solidity semantics. Public claims reveal the secret/path, derive the entry on-chain, verify finalized-root membership, and atomically consume the entry in event/deployment scope. Never accept an arbitrary caller-supplied consumption identifier.
- Test wrong secret/path/context, malformed encoding, invalid-claim non-consumption, and duplicate rejection across senders. Record the intentional first-claim front-running weakness rather than asserting wallet-bound proof protection.
- Public-claim gas/code-size/calldata measurements and BSC testnet cost approval still apply, but measure ordinary membership verification, not a Solidity ZK verifier. Stop treating failed Solidity STARK integration as a blocker for private ZK selection.
- Public claims must warn that the disclosed credential allows observers to generate private presentations indefinitely. Private ZK hides witness data in a new presentation; it does not restore secrecy of an already disclosed credential.
- Publication remains gated on the shared canonical cryptographic format; its finalization and single-version transition rules must prevent duplicate public claims across versions.

## Agreed investigation gates (2026-11-13)

- Scope is research and reproducible benchmarks, not production proof-feature implementation. Final cryptographic format approval is required before proof-dependent implementation is unblocked.
- `docs/attendance-credentials.md` remains authoritative for existing v1 credential serialization and SHA-256 derivation. The subsequent user-approved v2 direction permits replacement of secret/entry hashing as well as Merkle and nullifier hashing, accepting regenerated QR entries. Select the prover first and evaluate its supported proof-friendly hashes (Poseidon2 is a candidate, not a frozen choice). Final format approval remains required.
- Provisional POC acceptance targets: 1,024 attendance credentials; desktop Chrome and Firefox; at most 60 seconds for complete browser proof generation including witness preparation; at most 1 GiB peak memory; at most 50 MiB downloaded proving artifacts.
- Report cold downloads and warm proving separately, with exact hardware, browser versions, commands, and measurement limitations. Results establish feasibility only on documented environments. Unmeasured requirements are unverified, not passed.
- Freshly generated private presentations of the same credential must be unlinkable through proof contents. Reusing an identical proof file remains recognizable. Private presentations expose no stable credential identifier.
- Public claims bind chain, DAO deployment, event, finalized root, proof-format version, and recipient wallet. The constrained nullifier is independent of recipient, so transferring a credential or changing wallets cannot enable another claim for that credential in the same event/deployment scope.
- Verifiers accept only application-approved, versioned proof configurations, never arbitrary verification keys supplied by a presentation.
- Benchmarking may use reproducible credential vectors. Real-wallet re-signing/recovery must be demonstrated before declaring the complete attendance workflow ready, but does not block proof-system benchmarking.
- Measure verifier deployment and claim transactions on BSC testnet. Chain-limit compatibility is necessary but insufficient: the user must approve a concrete gas/cost ceiling before candidate acceptance. Missing testnet access or credentials leaves this gate blocked.
- Research proposes canonical Merkle rules, proof/public-input encoding, nullifier construction, verification-artifact identification, and versioning. Return these for user approval before freezing any production format.
- If no candidate meets the requirements, report infeasibility or explicit blockers. Do not silently relax budgets, add a trusted-setup wrapper, or change credential derivation outside an explicitly approved versioned format.

Initial primary-source findings and the benchmark plan are tracked in `docs/research/transparent-attendance-proofs.md`.

## Evaluation checkpoints

- `docs/research/private-browser-zk-evaluation.md`: revised private-only candidate evaluation. Native Plonky3 ZK controls passed; these are not browser or attendance benchmarks.
- `docs/research/poseidon2-cross-runtime-qualification.md`: actual native Noir beta.26 and Solidity execution agreed on all four lanes of 14 BN254 Poseidon2 T4 permutation vectors. Upstream API/fuzz and additional boundary checks passed. Compression includes feed-forward and is not raw permutation projection. This qualifies primitive implementations for further evaluation, not a credential/hash/tree format.
- Browser/ProveKit qualification remains incomplete. The user requested rechecking and resuming interrupted work; the resumed task must inspect existing logs/processes before repeating builds and record actual results or precise blockers in `docs/research/private-browser-zk-qualification.md`.
- No production format is approved and no proof-dependent implementation gate is cleared by these controls.

## Blocking policy

Treasury creation, TestUSD funding, voting NFTs, proposals, voting, fund release, signature recovery, and local QR collection can proceed without this investigation.

Production-format attendance-tree publication and real proof generation/verification must wait for this investigation's cryptographic format agreement. Development fixtures may test their interfaces but must not be represented as genuine ZK proofs or finalized production-compatible commitments.

## Comments

2026-11-13 (executed Solidity control): [Pinned Stwo smoke-test results](../docs/research/stwo-verifier-smoke-test.md): exact low-security Fibonacci fixture passes (3 queries; 21,008,961 verification-call gas); verifier runtime is 48,073 bytes. Existing adjacent configuration-validation test fails unchanged on its low-query expectation; no active end-to-end invalid-proof test was identified. Browser proving, ZK masking, complete attendance/hash constraints, and BSC deployment remain unverified/blocked. No production ticket or format approval is unblocked.

The user requested deferring this investigation while creating feature specs and implementation tickets.

2026-11-13: The user approved the gates above and explicitly authorized recording the agreement and beginning the investigation. This supersedes the earlier execution deferral, not the blocking policy or production-format approval gate.

2026-11-13 (hash revision): The user explicitly approved replacing credential hashing too, accepting a new credential version and regenerated QR entries. This supersedes the SHA-256-preservation requirement for the proposed new format, not existing v1 semantics. Investigate a matched prover/hash configuration before selecting the exact algorithm, parameters, encodings, domain separators, or migration policy. Do not mix credential versions within a finalized attendance set or allow a version change to bypass duplicate-claim prevention; resolve transition rules before production rollout.

2026-11-13 (public-claim revision): User confirmed secret-and-Merkle-path disclosure with ordinary on-chain hash verification, one public claim per entry, and accepted credential copying/private-proof reuse and first-claim front-running. ZK is now private/off-chain only. Re-evaluate candidate systems under the simplified scope; previous direct-EVM verifier failures do not establish private-proof infeasibility.
