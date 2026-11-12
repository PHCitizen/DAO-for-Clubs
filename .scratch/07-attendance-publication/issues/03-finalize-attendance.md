# 03: Finalize the attendance root and reference on-chain

**ID:** 07.03
**Spec:** [Feature 07: Immutable attendance publication](../spec.md)
**What to build:** The event organizer permanently records the prepared attendance root and IPFS reference once, independently of voting and funding outcomes.
**Blocked by:** [07.02 — Pin the prepared attendance set](02-pin-attendance-set.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Only the recorded proposal creator can finalize its attendance; enforce authorization through direct contract calls, not only UI controls.
- [ ] Record the prepared root and matching IPFS reference together, exactly once, with no overwrite, correction, late-addition, or organizer-replacement path.
- [ ] Require explicit irreversible-publication confirmation and identify the event/deployment, count, root, and reference being finalized.
- [ ] No successful vote, treasury balance, payout, or scheduled event-end condition is required; rejected or unfunded proposals may have attendance attestations.
- [ ] Distinguish pinning success, submitted finalization, and confirmed on-chain publication. A rejected/failed chain request leaves retry possible without claiming that attendance is already finalized.
- [ ] Expose authenticated finalized-root/reference reads for retrieval and both proof features; prevent the scanner from offering changes as amendments to an already finalized set.
- [ ] Real-contract and application tests cover wrong caller, duplicate/overwrite attempts, matching prepared values, pin-success/transaction-failure retry, and finalization for unsuccessful/unfunded proposals.

## Scope

The reference is public and may outlive the organizer's account or browser. Do not add revocation, corrections, automatic funding constraints, or silently bypass the inherited TODO-01 requirement.
