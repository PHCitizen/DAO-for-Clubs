# Feature 05: Creator-controlled fund release

Status: ready-for-agent

## Problem Statement

A proposal can pass while its treasury lacks sufficient TestUSD. Organizers must not lose the recorded voting result or their ability to collect funding simply because voting has closed or another proposal used the available balance.

## Solution

Let the proposal creator request its fixed payment once the proposal has passed. Preserve passing independently of payment, support retries after funding shortages, and allow the release interaction to record a qualifying result while voting is still open.

## User Stories

1. As an organizer, I want to release funding for my passed proposal, so that I can receive the approved allocation.
2. As an organizer, I want payment sent to the original fixed recipient, so that voted funding terms cannot be redirected later.
3. As a participant, I want release restricted to the proposal creator, so that unrelated callers cannot trigger the creator-controlled workflow.
4. As an organizer, I want a clear insufficient-funds result, so that I know to wait rather than assume the proposal failed.
5. As an organizer, I want passing remembered when the treasury is short, so that I do not need another vote later.
6. As an organizer, I want to retry after the treasury receives funds, so that a temporary shortage does not cancel my allocation.
7. As an organizer, I want to collect after vote close, so that the voting deadline does not become an unintended payment deadline.
8. As an organizer, I want a release request to record a qualifying passing result while voting remains open, so that I need not submit a separate passing transaction first.
9. As a treasury participant, I want each proposal paid only once, so that repeated requests cannot drain the treasury.
10. As a visitor, I want to distinguish passed-awaiting-funds from paid, so that I can follow allocations accurately.
11. As a participant, I want multiple proposals to use the same treasury safely, so that each payment reflects the balance actually available at execution.
12. As a visitor, I want the funding history inspectable, so that I can verify payouts without assuming they prove subsequent spending.

## Implementation Decisions

- Only the recorded proposal creator may request release. The treasury, amount, and recipient are fixed by proposal creation.
- Pay in shared TestUSD and only after a passing result exists. No native-BNB payout or alternate currency is introduced.
- A release request made while voting is open may use the shared passing rule to record passing before attempting payment.
- Recording passing does not reserve funds and is not conditional on treasury balance. An insufficient-balance path must not revert away a newly recorded passing result.
- Preserve an externally observable distinction between a successful payment and a passing result with funding still pending. A transaction receipt alone must not cause the UI to report payment if no funds moved.
- A previously passed proposal remains releasable after vote close. A never-passed proposal cannot first pass through a late release request.
- Prevent duplicate payments and reentrant execution. The treasury payment integration accepts only the authorized proposal-payment interaction, not arbitrary withdrawals.
- Use the actual balance at payment execution. Multiple passed proposals compete for available funds; passing does not promise that funds have been reserved.
- Failed unauthorized, duplicate, or ineligible requests must not change proposal or balance state. Handle actual ERC20 transfer failure without incorrectly reporting a completed payout.
- Keep voting, payment, and attendance outcomes separate in reads and presentation.

## Testing Decisions

- Through the application action/read interface and real local contracts, pass a proposal, request payment, and inspect creator/treasury balances and paid state.
- Verify retry after a shortage, including replenishment after vote close and multiple passed proposals sharing an underfunded treasury.
- Explicitly test a single release transaction that first records passing but finds insufficient balance: passing persists, payment does not occur, and a later request succeeds.
- Test wrong caller, duplicate release, payment before passing, first passing attempted after deadline, and fixed recipient/amount enforcement with direct contract calls.
- Assert payment amounts and state transitions rather than private bookkeeping. Include adversarial transfer/reentrancy behavior where the chosen contract integration exposes it.
- Reuse proposal and TestUSD fixtures. There is no earlier payout implementation to preserve.

## Out of Scope

- Fund reservation, installment payments, recipient changes, automatic payment scheduling, escrow disputes, expense verification, and treasury refunds.
- Arbitrary administrator withdrawals or permissionless payout triggering.
- Reopening votes or retroactively inferring passing after vote close.

## Further Notes

A receipt for a release request is not necessarily a receipt for payment. The waiting-for-funds result must be clear in both external state and UI. Funding has no authority over attendance collection or publication.
