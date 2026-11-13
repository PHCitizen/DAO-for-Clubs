# 02: Generate and download a private proof

**ID:** 08.02
**Spec:** [Feature 08: Private off-chain attendance presentations](../spec.md)
**What to build:** An attendee generates a genuine private attendance presentation in the browser and downloads a versioned proof file to share with a verifier.
**Blocked by:** [08.01 — Prepare a private attendance witness](01-prepare-private-witness.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Use the actual transparent prover, canonical statement, artifacts, and supported bounds established by TODO-01, operating on the prepared private witness without a proving backend.
- [ ] Prove knowledge of the secret yielding an entry in the finalized event root, with public statement data sufficient to authenticate the event/deployment while hiding the attendance entry and wallet.
- [ ] Export the agreed versioned proof file without secret, wallet address, recovery signature, selected leaf, membership path, public-claim nullifier, or another stable entry identifier.
- [ ] Give honest preparation/proving/completion/failure feedback. Do not offer a successful download when proving failed or prepared context became stale.
- [ ] Validate a generated artifact with the real off-chain verification primitives and canonical trusted artifacts; do not depend on completion of the separate import UI.
- [ ] Real proof round-trip and negative tests cover valid membership, incorrect witness/root/event, changed account/deployment during preparation, and artifact privacy. Document a browser proving smoke check within measured limits.

## Scope

No trusted-setup fallback, server proving, fake proof acceptance, personal identity guarantee, or restriction on forwarding a proof file. Active TODO-01's private browser-ZK qualification and shared-format gates are inherited; no Solidity ZK verifier is required. Observers of disclosed public credentials can generate private proofs; do not promise exclusive possession.
