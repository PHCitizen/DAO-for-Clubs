# Feature 09: Opt-in public attendance claims

Status: ready-for-agent
Blocked by: TODO-01 and authenticated attendance publication

## Problem Statement

Some attendees want a permanent public wallet–event association, but revealing the underlying attendance secret would let observers copy the credential. The claim must be verified on-chain, bound to its intended wallet, and limited to one public claim per credential.

## Solution

Let a credential holder explicitly opt into a public claim, generate a transparent ZK proof bound to the claiming wallet, and submit it for on-chain verification. Record the association and enforce a deterministic per-credential nullifier without publishing the secret.

## User Stories

1. As a credential holder, I want to choose whether to publish my attendance, so that private attendance does not automatically become a public wallet record.
2. As a credential holder, I want a clear permanence warning before claiming, so that I understand the privacy trade-off.
3. As a credential holder, I want the intended claiming wallet displayed, so that I do not publish the association for the wrong account.
4. As a credential holder, I want to generate the claim proof locally, so that my secret does not leave the browser.
5. As a claimant, I want the secret hidden in my transaction, so that mempool observers cannot recover the credential from normal submission.
6. As a claimant, I want my proof bound to my wallet, so that another account cannot copy the transaction and claim for itself.
7. As a participant, I want one public claim per attendance credential, so that sharing a credential does not permit unlimited public claims.
8. As a claimant, I want account or deployment changes to invalidate an obsolete prepared claim, so that I do not accidentally submit against the wrong public statement.
9. As a claimant, I want transaction rejection and failure explained, so that I know whether a claim actually exists on-chain.
10. As a visitor, I want to inspect public claims for an event, so that I can see voluntary wallet–event associations.
11. As a visitor, I want to inspect a wallet's recorded claims, so that I can verify its public attendance history.
12. As a participant, I want invalid or duplicate claims rejected on-chain, so that bypassing the application cannot forge a record.
13. As a credential holder, I want off-chain presentations to remain possible after a public claim, so that the public-claim uniqueness rule is not mistaken for credential revocation.
14. As a visitor, I want public claims described as organizer-attested credential possession, so that I do not infer non-transferable personal identity.
15. As a visitor, I want attendance independent of voting or funding status, so that a public claim is not mistaken for proof of treasury payment.

## Implementation Decisions

- Use the transparent proof pipeline validated by TODO-01, with an on-chain verifier compatible with BNB Smart Chain testnet. Do not add an undisclosed trusted-setup wrapper to make verification cheaper.
- Prove the same underlying attendance membership relation as private presentations, adding a claiming-wallet binding and constrained per-credential nullifier.
- Scope the nullifier to the attendance credential and event/deployment so it cannot be varied by changing the claiming wallet to obtain another claim. Its derivation is part of the reviewed cryptographic format, not an arbitrary client-supplied identifier.
- Enforce wallet binding in the proved public statement and contract execution. A copied valid proof must not authorize a different sender to claim for a different wallet.
- Consume the nullifier only when a valid claim is recorded. Invalid transactions must not block the legitimate credential holder by reserving a nullifier.
- Never include the secret, wallet signature used for recovery, leaf selection, or membership witness in calldata or events.
- The contract records one permanent public association for that credential. A second public claim with it fails even from another wallet; voluntarily sharing the underlying credential remains possible before claiming.
- Claiming does not revoke the credential or consume private off-chain presentations. Private proofs must not publish the claim nullifier simply for convenience.
- Require an authenticated, finalized attendance root for the intended proposal. A valid attendance claim need not correspond to a passed or funded proposal.
- Provide an explicit privacy opt-in before submission and display the target wallet and event. Regenerate or discard prepared claims when account, event, or deployment changes.
- Expose public reads/events for event and wallet claim inspection without a backend indexer. Present transaction-submitted and claim-confirmed as different states.

## Testing Decisions

- Test proof preparation, explicit opt-in, submission, and public inspection through the application action/read interface backed by real contracts and the selected real verifier.
- Direct contract tests cover a copied proof from another wallet, changed recipient, altered nullifier, duplicate credential claims, altered event/root, and proof replay across deployments.
- Verify nullifier constraints inside the actual proof relation: merely testing that the contract stores a caller-supplied nullifier is insufficient.
- Confirm invalid submissions do not consume the nullifier, successful claims are permanent, and a second wallet cannot claim again with the same credential.
- Inspect transaction inputs and events for absence of secrets and signatures. Verify a public claim does not disable private proof generation/verification.
- Test wallet switching between preparation and submission, rejected transactions, and read-only claim discovery.
- Reuse canonical proof artifacts, publication vectors, and foundation fixtures. No existing public-claim implementation exists.

## Out of Scope

- Publishing raw secrets, identifying real-world people, preventing voluntary credential sharing, claim deletion, transfer, correction, or revocation.
- Gasless relayers, alternate trusted-setup proof systems, mainnet deployments, and application-operated proving backends.
- Treating a claim as evidence of successful voting, payment, audited spending, or independently verified physical presence.

## Further Notes

Private and public proof implementations may share internal cryptographic work, but their public statements and privacy promises differ. Public-claim work need not wait for the private-proof UI once the shared cryptographic interface is established.
