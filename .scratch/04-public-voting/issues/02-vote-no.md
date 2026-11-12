# 02: Cast a no vote

**ID:** 04.02
**Spec:** [Feature 04: Public voting and recorded passing](../spec.md)
**What to build:** An eligible voting-NFT holder can publicly oppose a proposal, permanently consuming that credential's vote for the proposal.
**Blocked by:** [04.01 — Cast a yes vote and automatically record passing](01-vote-yes-and-pass.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Provide a no-vote action using the same treasury NFT ownership, open-vote, and chain/deployment checks as yes voting.
- [ ] Record the no ballot and its public choice, updating no totals without treating participation alone as approval.
- [ ] Consume the NFT's vote regardless of choice: no-then-yes, yes-then-no, and repeated no submissions all fail for the same proposal/token.
- [ ] Retain the one-vote-per-token rule across wallets and the ability to vote separately with other owned NFTs or on other proposals.
- [ ] Apply the shared live-threshold check to a vote transaction; if existing yes votes already qualify after a supply change, record passing consistently rather than inventing a different rule for no ballots.
- [ ] Confirmation identifies the actual ballot/result; rejected, unauthorized, or closed-vote submissions do not change totals.
- [ ] Real local-chain and application tests cover no voting, cross-choice duplication, ownership/treasury isolation, deadline/early-close rejection, and participation without sufficient yes votes.

## Scope

Do not make ballots changeable or introduce an abstention/participation quorum. Full public activity browsing is a separate ticket.
