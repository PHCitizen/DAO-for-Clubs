# TODO-02: Specify and approve the attendance publication format

Status: ready-for-agent
Type: task
Execution: authorized for specification and local vector evaluation; final format approval remains required.

## Purpose

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

User requested Chrome-only scope and removing unrelated proof qualification blockers from feature 07. This ticket makes the remaining format work executable; it does not declare an unspecified format approved.
