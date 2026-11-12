# 01: Prepare a wallet-bound public-claim proof

**ID:** 09.01
**Spec:** [Feature 09: Opt-in public attendance claims](../spec.md)
**What to build:** A credential holder explicitly chooses a permanent public wallet-event association and generates its real wallet-bound proof locally without revealing the attendance secret.
**Blocked by:** [07.04 — Retrieve and validate the attendance set](../../07-attendance-publication/issues/04-validate-attendance-data.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Reuse supported credential recovery and validated membership reconstruction to prove attendance using the transparent system selected by TODO-01.
- [ ] Display the intended wallet/event/deployment and require explicit consent explaining that a later submitted public association is permanent.
- [ ] Constrain the claiming wallet and per-credential nullifier in the actual proof relation. Changing the wallet must not permit choosing a fresh nullifier for the same event credential.
- [ ] Apply reviewed event/deployment separation and produce the public inputs expected by the eventual on-chain verifier; do not accept an unconstrained client-chosen uniqueness identifier.
- [ ] Generate locally, exposing honest progress/failure and excluding secret, recovery signature, leaf selection, and path from public proof artifacts and logs.
- [ ] Discard or regenerate prepared claims after changes to wallet, event, or deployment. This preparation alone is not a recorded on-chain claim.
- [ ] Real cryptographic tests cover valid preparation, wrong credential/root, changed wallet, changed nullifier, and deployment separation; application tests cover consent, switching, and failure feedback.

## Scope

Private and public proofs share reviewed internals but not public statements; private presentations must not acquire the claim nullifier. This does not wait for the private-proof UI and inherits the deferred TODO-01 gate.
