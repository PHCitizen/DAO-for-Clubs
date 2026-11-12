# 04: Inspect public ballots and voting progress

**ID:** 04.04
**Spec:** [Feature 04: Public voting and recorded passing](../spec.md)
**What to build:** Read-only users can inspect a proposal's public ballots, totals, live threshold, and recorded voting outcome without confusing them with funding or attendance.
**Blocked by:** [04.02 — Cast a no vote](02-vote-no.md); [04.03 — Explicitly record passing after NFT burns](03-record-passing-after-burns.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Show public ballot identities, token IDs, choices, yes/no totals, and the current treasury NFT supply/threshold using authenticated contract reads/events.
- [ ] Distinguish open, recorded passed, and deadline-closed-without-passing states using chain time and recorded state rather than a client timer alone.
- [ ] Explain live-supply administrator influence and distinguish a currently sufficient tally from a passing result that was actually recorded before close.
- [ ] Refresh after confirmed ballots and membership mutations without removing historical burned-token votes or fabricating automatic passing.
- [ ] Support wallet-free inspection and honest loading/transport-error states without a backend indexer.
- [ ] Tests cover both ballot choices, burn/mint threshold changes, exact close, irreversible passing, retained historical ballots, and separation from payment/attendance status.

## Scope

Reuse the proposal's document/reference rather than adding another editor or publication flow. This is a read workflow, not authority to reopen closed votes.
