# 02: Show a funding shortage and retry payment

**ID:** 05.02
**Spec:** [Feature 05: Creator-controlled fund release](../spec.md)
**What to build:** A creator sees that a passed proposal is awaiting funds and can retry its payment after the treasury is replenished, including after vote close.
**Blocked by:** [05.01 — Release funds for an already passed proposal](01-release-passed-proposal.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Distinguish passed-awaiting-funds, payment pending, payment failed, and paid using actual on-chain state and transfer outcomes.
- [ ] An underfunded request preserves previously recorded passing and makes no partial payment or paid-state update.
- [ ] Replenishing the treasury enables the creator to retry successfully without another vote or an extension of the voting deadline.
- [ ] Use execution-time balance, not a stale UI estimate. Show that passing does not reserve funds when two passed proposals share an underfunded treasury.
- [ ] Keep creator-only authorization and exactly-once payment enforcement on every retry.
- [ ] Real local-chain and application tests cover shortage, replenishment, retry after vote close, competing proposals, and a repeat request after successful payment. Fixtures may fund the treasury directly without depending on the deposit UI.

## Scope

This works with already recorded passing. The next ticket handles a release request that first records passing and then encounters insufficient funds.
