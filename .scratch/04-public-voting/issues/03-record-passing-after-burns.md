# 03: Explicitly record passing after NFT burns

**ID:** 04.03
**Spec:** [Feature 04: Public voting and recorded passing](../spec.md)
**What to build:** Anyone can trigger a passing check while voting is open, including when NFT burns have made existing yes votes sufficient without another ballot.
**Blocked by:** [04.01 — Cast a yes vote and automatically record passing](01-vote-yes-and-pass.md); [02.06 — Burn voting NFTs without reusing IDs](../../02-treasuries-and-membership/issues/06-burn-voting-nfts.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Expose the permissionless passed interaction using the same current-supply threshold and irreversible passing state as ballot transactions.
- [ ] Demonstrate six NFTs and three yes votes, followed by two burns: an explicit check before deadline records passing without a fourth vote.
- [ ] Burning does not remove previously cast votes or reset token consumption; new minting can raise the threshold before passing is recorded.
- [ ] Require sufficient recorded yes votes and an open vote. Reject a first passing record at/after deadline even if the threshold was satisfied earlier without a transaction.
- [ ] Once recorded, passing survives later minting/burning and closes further voting. Treasury balance is irrelevant.
- [ ] Provide clear check/result feedback without presenting the transaction as a payout or an administrative approval.
- [ ] Real-contract and application tests cover the concrete burn scenario, burned-voter vote retention, failed threshold checks, exact deadline, and irreversible passing. Include current supply zero with and without retained yes votes.

## Scope

No historical supply tracking, snapshots, automatic timer execution, or retroactive passing after vote close. The shared check is also consumed by the release interaction.
