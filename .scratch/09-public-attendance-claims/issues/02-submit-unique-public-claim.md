# 02: Submit and enforce a unique public claim

**ID:** 09.02
**Spec:** [Feature 09: Opt-in public attendance claims](../spec.md)
**What to build:** A claimant submits their prepared proof for on-chain verification, creating one permanent wallet-event association per attendance credential without exposing its secret.
**Blocked by:** [09.01 — Prepare a wallet-bound public-claim proof](01-prepare-public-claim-proof.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Verify the actual transparent proof on the supported chain against the intended proposal's finalized root and application-trusted verifier configuration.
- [ ] Enforce claimant-wallet binding in both the proved statement and transaction execution. Copying a valid proof must not authorize another sender to claim for a different wallet.
- [ ] Consume the constrained event/credential nullifier only for a valid recorded claim. Reject reuse even from a different wallet; invalid submissions must not reserve it.
- [ ] Record a permanent inspectable wallet-event association and expose public reads/events for subsequent browsing. Attendance requires neither passed voting nor payment.
- [ ] Calldata and events contain no secret, recovery signature, selected leaf, or membership path. Do not solve replay by publishing credential material.
- [ ] Show submitted versus confirmed claim accurately, with wallet rejection, verification failure, duplicate-claim, and stale-account feedback.
- [ ] Real verifier/contract and application tests cover correct claiming, copied proof, altered recipient/nullifier/root/event, cross-deployment replay, duplicate credential use, and invalid-claim non-consumption.
- [ ] Verify a successful public claim does not revoke or consume private off-chain presentations for the same credential.

## Scope

No claim deletion, transfer, revocation, gasless relayer, or weakened verification fallback. Inherits TODO-01; fixtures alone cannot satisfy on-chain verification acceptance.
