# 03: Browse public claims by event and wallet

**ID:** 09.03
**Spec:** [Feature 09: Opt-in public attendance claims](../spec.md)
**What to build:** A read-only visitor can inspect confirmed public attendance associations for an event or wallet without treating them as evidence of funding or personal identity.
**Blocked by:** [09.02 — Submit and enforce a unique public claim](02-submit-unique-public-claim.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Provide event-oriented and wallet-oriented views of confirmed public claims using authenticated contract reads/events without a backend indexer.
- [ ] Identify each association's wallet, proposal, deployment, and confirmation reference; do not display pending or failed claim transactions as recorded attendance.
- [ ] Support wallet-free inspection, empty histories, multiple events/wallets, and recoverable RPC errors without duplicating records on refresh.
- [ ] Explain that these are voluntary permanent public associations based on transferable organizer-attested credentials, not non-transferable identity or independent proof of presence.
- [ ] Explain that public claims disclose reusable credentials and may be front-run; a recorded wallet does not establish exclusive possession or original ownership. Browsing must not unnecessarily reproduce raw secrets or paths.
- [ ] Keep voting, payment, and attendance claims distinct, including claims on proposals that never passed or received funds.
- [ ] Tests use real locally verified claim records to cover event/wallet filtering, multiple deployments, empty results, confirmation/refresh behavior, and transport failure.

## Scope

No claim editing, deletion, transfer, private-attendee discovery, or additional indexer infrastructure. Claim submission already discloses the secret/path; browsing must not imply otherwise or add a secret-display feature. Reuse public state already established by claim submission.
