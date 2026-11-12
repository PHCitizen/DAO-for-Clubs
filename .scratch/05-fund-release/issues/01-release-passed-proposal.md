# 01: Release funds for an already passed proposal

**ID:** 05.01
**Spec:** [Feature 05: Creator-controlled fund release](../spec.md)
**What to build:** The creator of an already passed proposal can collect its fixed TestUSD allocation exactly once, even after the voting deadline.
**Blocked by:** [04.01 — Cast a yes vote and automatically record passing](../../04-public-voting/issues/01-vote-yes-and-pass.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Only the recorded proposal creator can request payment; the treasury, amount, and recipient are the immutable values established at proposal creation.
- [ ] Transfer shared TestUSD only for a passed proposal, mark successful payment, and prevent duplicate or reentrant payout.
- [ ] A recorded passing result remains payable after vote close. A never-passed proposal is not payable merely because its deadline ended.
- [ ] The treasury accepts only the authorized proposal-payment integration; direct arbitrary withdrawals and requests from unrelated callers fail.
- [ ] Show payment confirmation only when funds actually moved. An insufficient balance or failed transfer cannot create paid state or erase an existing passing record.
- [ ] Real local-chain and application tests inspect exact creator/treasury balance changes and cover wrong caller, unpassed proposal, post-close payment, repeat request, and transfer failure protections.

## Scope

Use funded fixtures for the successful path; no dependency on a deposit UI is required. Detailed shortage/retry UX and first recording passing during release are separate tickets. Safe failure remains required here.
