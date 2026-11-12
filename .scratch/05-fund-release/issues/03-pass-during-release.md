# 03: Record passing during a release request

**ID:** 05.03
**Spec:** [Feature 05: Creator-controlled fund release](../spec.md)
**What to build:** The creator requests release for a qualifying open proposal without a separate passing transaction; passing persists even if the treasury cannot yet pay.
**Blocked by:** [05.02 — Show a funding shortage and retry payment](02-retry-funding-shortage.md); [04.03 — Explicitly record passing after NFT burns](../../04-public-voting/issues/03-record-passing-after-burns.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] A creator release request can invoke the shared live-threshold passing rule while voting is open, including when NFT burns made the existing yes tally sufficient.
- [ ] With sufficient funds, the interaction records passing and pays the fixed allocation exactly once.
- [ ] With insufficient funds, the transaction retains the newly recorded passing result, does not pay or mark paid, and gives an observable awaiting-funds result. Do not revert away passing merely to report shortage.
- [ ] A later creator request can pay after replenishment even after vote close. No new vote or passing check is needed.
- [ ] Reject first recording passing through release at/after deadline, requests without enough yes votes, and requests by other callers; preserve existing passed-proposal behavior.
- [ ] Tests demonstrate an open burn-qualified proposal with no funds, one release transaction persisting passing, and a successful later payment, plus funded, unauthorized, deadline, and duplicate-request cases.

## Scope

Reuse the voting feature's rule rather than maintaining a second threshold algorithm. No fund reservations, partial payments, or retroactive passing are introduced.
