# Feature 09: Opt-in public attendance claims

Status: ready-for-agent
Blocked by: TODO-01 and authenticated attendance publication

## Problem Statement

Some attendees want a permanent public wallet–event association. They explicitly accept disclosing a transferable attendance credential, allowing observers to copy it for private presentations or front-run the first public claim. The contract must verify finalized-set membership and permit only one public claim per entry in an event/deployment.

## Solution

Let a credential holder explicitly opt into revealing the secret and Merkle path. The contract derives the entry, verifies its membership against the finalized event root with ordinary hashes, records the sender–event association, and atomically consumes the entry. No on-chain ZK verifier is required. The wallet signature used for recovery remains private.

## User Stories

1. As a credential holder, I want to choose whether to publish my attendance, so that private attendance does not automatically become a public wallet record.
2. As a credential holder, I want a clear permanence warning before claiming, so that I understand the privacy trade-off.
3. As a credential holder, I want the intended claiming wallet displayed, so that I do not publish the association for the wrong account.
4. As a credential holder, I want to prepare the secret and membership path locally before explicitly opting into disclosure.
5. As a claimant, I want a warning that public calldata permanently reveals my credential and allows observers to generate private presentations.
6. As a claimant, I want a warning that a mempool observer can copy my credential and front-run the first claim for their own wallet; this is an accepted POC weakness.
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

- Use the canonical credential and Merkle format established by TODO-01, with ordinary hash/membership checks compatible with BNB Smart Chain testnet. No Solidity ZK verifier is required.
- Accept a secret and Merkle path; derive the entry and verify membership against the event's authenticated finalized root. An already-public entry alone is not evidence of knowledge of its secret.
- Scope consumed-entry storage to event/deployment. Derive the consumption key from the validated entry, never an arbitrary client-supplied identifier or recipient-dependent value.
- Record the association for the transaction sender. A copied secret/path can authorize a different sender before consumption; front-running is explicitly accepted, not prevented by wallet display or client checks.
- Consume the entry only when a valid claim is recorded. Invalid transactions must not reserve it.
- Calldata deliberately reveals the secret and membership witness. Never publish the wallet signature used for recovery. Avoid redundant secret disclosure in events, which need only support public claim inspection.
- The contract records one permanent public association for that credential. A second public claim with it fails even from another wallet; voluntarily sharing the underlying credential remains possible before claiming.
- Claiming does not revoke the credential or consume private off-chain presentations. Anyone copying the revealed secret can now generate their own private presentations. Private proofs still hide their witness and expose no stable entry identifier.
- Require an authenticated, finalized attendance root for the intended proposal. A valid attendance claim need not correspond to a passed or funded proposal.
- Provide an explicit privacy opt-in before submission and display the target wallet and event. Warn about irreversible credential disclosure, observer-generated private proofs, and front-running before opt-in. Regenerate or discard prepared claims when account, event, or deployment changes.
- Expose public reads/events for event and wallet claim inspection without a backend indexer. Present transaction-submitted and claim-confirmed as different states.

## Testing Decisions

- Test witness preparation, explicit disclosure opt-in, submission, and public inspection through the application action/read interface backed by real contracts and canonical hash vectors.
- Direct contract tests cover wrong secret/path, malformed encoding, altered event/root, deployment separation, duplicate claims across wallets, and consumption keyed by the derived entry.
- Demonstrate the accepted weakness: another sender can submit copied valid secret/path first and receive the association. The original sender then fails as a duplicate; do not claim front-running protection.
- Confirm invalid submissions consume nothing, successful claims are permanent, and a second wallet cannot claim again with the same entry.
- Confirm calldata reveals the secret/path but never the recovery signature. Once private ZK exists, verify both the original holder and an observer with the disclosed secret can generate valid presentations.
- Test wallet switching between preparation and submission, rejected transactions, and read-only claim discovery.
- Reuse canonical credential/Merkle vectors, publication fixtures, and foundation fixtures. No existing public-claim implementation exists.

## Out of Scope

- Identifying real-world people, preventing credential copying or first-claim front-running, claim deletion, transfer, correction, or revocation. Secret disclosure is explicitly in scope.
- Gasless relayers, alternate trusted-setup proof systems, mainnet deployments, and application-operated proving backends.
- Treating a claim as evidence of successful voting, payment, audited spending, or independently verified physical presence.

## Further Notes

Private ZK and public hash-membership implementations share canonical credential/Merkle semantics, not an on-chain ZK pipeline. Public-claim work need not wait for the private-proof UI once the shared cryptographic interface is approved. User confirmed this scope change on 2026-11-13; child tickets and the implementation map have been reconciled. Shared-format and concrete public-claim cost approvals remain required.
