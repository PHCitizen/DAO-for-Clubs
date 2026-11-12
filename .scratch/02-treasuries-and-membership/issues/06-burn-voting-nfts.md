# 06: Burn voting NFTs without reusing IDs

**ID:** 02.06
**Spec:** [Feature 02: Treasuries, TestUSD, and voting membership](../spec.md)
**What to build:** A treasury administrator can remove a voting credential, see the live supply decrease, and issue later credentials without ever reusing the burned ID.
**Blocked by:** [02.05 — Mint and inspect non-transferable voting NFTs](05-mint-voting-nfts.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Allow only that treasury's administrator to burn one of its existing voting NFTs, including a token held by another wallet.
- [ ] Confirm the credential is no longer owned/active and show the updated live supply. Reject missing, already burned, or wrong-treasury token references.
- [ ] Minting after burning produces a fresh ID; burning must not reset allocation or permit reminting an old identifier.
- [ ] Preserve the integration rule that burn changes current supply, not historical proposal ballots or per-proposal consumption. Do not add vote deletion or membership snapshots.
- [ ] Distinguish confirmed removal from wallet rejection and transaction failure in the administrator workflow.
- [ ] Real local-chain and application tests cover authorization, repeated burns, cross-treasury isolation, supply changes, and burn-then-mint ID freshness.

## Scope

The effect on recorded passing is demonstrated in the explicit passing-check ticket. This ticket supplies the real membership mutation, not a mock supply override.
