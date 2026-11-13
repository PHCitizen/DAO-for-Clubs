# TODO-02: Specify and approve the attendance publication format

Status: ready-for-agent
Workflow: resolved
Type: task
Execution: completed; user explicitly approved the exact minimal POC format proposal and its four decisions.

## Purpose

Latest user direction: do the minimum needed for the POC. Evaluate one pinned construction, fixed depth 10 / maximum 1,024 entries, and one immutable v2 credential version per new event. Deliver a concrete proposal and durable executable vectors, not a configurable framework or production implementation. Minimal constraint compilation is in scope; private Chrome proof performance campaigns remain TODO-01 and are not feature 07 prerequisites. Final user format approval is still required.

Provide the concrete shared credential/Merkle agreement needed by feature 07 and ordinary public hash claims. This is a separate deliverable from TODO-01's private browser-proof qualification. Chrome is the only supported browser target; native proof interoperability and Firefox are not publication prerequisites.

## Acceptance criteria

- Specify v2 signature-to-secret recovery, canonical field/byte encoding, context binding, exact hash mode, parameters, padding, and separate recovery/entry/leaf/node/empty domains. Preserve existing v1 semantics; regenerate v2 QR entries rather than reinterpret old ones.
- Start evaluation from the pinned BN254 Poseidon2 T4 implementations with 14 passing cross-runtime permutation vectors. Explicitly distinguish raw permutation projection from feed-forward compression. Primitive tests are not approval of a sponge or credential construction.
- Specify sorting, deduplication, positional path bits, odd-node/empty-padding rules, empty/singleton roots, maximum 1,024 entries, path encoding, and dataset version/schema.
- Establish shared browser/Noir/Solidity vectors for the actual chosen construction, including sets of sizes 0, 1, 2, 3, 1,023, 1,024 and rejected 1,025, malformed encodings, field boundaries, and altered context/path.
- Finalize a single immutable credential version per event, with no dual-root or upgrade mechanism that resets public-entry consumption. Do not claim one-person uniqueness.
- Public claims disclose secret/path, verify hashes, record sender, and consume the derived entry. Preserve warnings about copying, private-proof reuse, and front-running.
- Demonstrate that the proposed membership relation can be constrained with the candidate Chrome prover in an isolated fixture, without claiming full private-proof acceptance. Record unresolved security-review concerns explicitly.
- Present the format and evidence for user approval. Only that approval clears feature 07's cryptographic-format gate. TODO-01 remains responsible for actual private Chrome proving budgets, privacy/security qualification, and approved verifier artifacts.

## References

- [TODO-01](01-transparent-zk-feasibility.md)
- [Hash primitive qualification](../docs/research/poseidon2-cross-runtime-qualification.md)
- [Chrome/native proof qualification](../docs/research/private-browser-zk-qualification.md)

## Comments

User approval: “approve”, following presentation of the concrete format and evidence. This resolves TODO-02 and clears feature 07's cryptographic-format gate. Implement the exact approved agreement in `docs/attendance-format-v2-proposal.md`; other ticket dependencies still apply. This approval does not qualify private-proof security/performance, resolve ProveKit verifier warnings, authorize deployment, or approve public-claim transaction costs.

## Answer

Approved the pinned BN254 Poseidon2 T4 feed-forward construction and domains/folds, canonical encodings and regenerated v2 credentials, sorted/deduplicated fixed-depth-10/count-bound tree (maximum 1,024 entries), and immutable v2 for new events only with no migration or consumption reset. Durable fixture evidence is under `packages/contracts/scripts/attendance-v2/`. Feature 07 may proceed once its ordinary implementation-ticket dependencies are satisfied; TODO-01 continues separately for private-proof qualification.

2026-11-13: Claimed for the minimal POC format deliverable. Proposed exact agreement: [attendance-format-v2-proposal.md](../docs/attendance-format-v2-proposal.md). Durable contracts-owned fixture: [README](../packages/contracts/scripts/attendance-v2/README.md), TypeScript construction/evaluator, Solidity adapter, Noir relation/tests, and exact vectors. Actual selected feed-forward mode agrees across Solidity, native Noir and Chrome NoirJS on 26 vectors; all requested sizes 0/1/2/3/1023/1024 are covered, 1025 is rejected. Native Noir: 36 tests passed. ProveKit prepared the real relation (5,285 constraints / 5,507 witnesses); Chrome witness controls and one actual Chrome proof/verify roundtrip passed, including changed-public-input/transcript rejection. These are functional controls, not privacy/security/budget acceptance. ProveKit FinalClaim warnings remain unresolved. Isolated strict TypeScript check passed; the package-wide check is blocked by missing generated public-artifacts/deployment manifest in this checkout. No deployment, production behavior change, v1 migration or cryptographic primitive patch. User approval of the exact proposed construction/encoding/version policy remains required; feature 07 is not yet unblocked.

User requested Chrome-only scope and removing unrelated proof qualification blockers from feature 07. This ticket makes the remaining format work executable; it does not declare an unspecified format approved.
