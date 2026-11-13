# DAO for Clubs implementation map

## State

Nine feature specs and the original 33 implementation tickets are published. Implementation is underway; consult individual ticket completion evidence rather than treating this map as a completion ledger. Proposal authoring/IPFS publication and public voting are separate features.

Feature IDs have been renumbered before ticket publication: 03 is proposal authoring, 04 is public voting, and the remaining features follow in order. These identifiers supersede the earlier eight-feature proposal.

Spec status indicates a defined work contract, not that every dependency is satisfied. Work only on tickets whose blockers are complete. TODO-01 is authorized and in progress, not deferred. It now qualifies private browser/off-chain ZK and the shared credential/Merkle format; public claims do not require a Solidity ZK verifier.

## Feature specs

| Feature | Spec | Focus |
| --- | --- | --- |
| 01 | [Browser application foundation](01-browser-foundation/spec.md) | pnpm workspace scaffold, client runtime, wallet session, deployment context |
| 02 | [Treasuries and membership](02-treasuries-and-membership/spec.md) | Treasury creation, TestUSD funding, administrator-managed voting NFTs |
| 03 | [Proposal authoring and publication](03-event-proposals/spec.md) | Markdown editing/preview, IPFS documents, on-chain proposal identity and terms, public reading |
| 04 | [Public voting](04-public-voting/spec.md) | Public ballots, token consumption, live thresholds, vote close, recorded passing |
| 05 | [Fund release](05-fund-release/spec.md) | Creator-only payouts, shortages, retry, passing during release |
| 06 | [Attendance credentials and scanning](06-attendance-credentials-and-scanning/spec.md) | Signature recovery, scoped QR codes, local check-in |
| 07 | [Attendance publication](07-attendance-publication/spec.md) | Canonical attendance data, organizer-funded IPFS pinning, immutable root |
| 08 | [Private attendance proofs](08-private-attendance-proofs/spec.md) | Private witness preparation, browser proving, off-chain verification |
| 09 | [Public attendance claims](09-public-attendance-claims/spec.md) | Secret/path disclosure, on-chain hash membership and entry consumption, public inspection |

Active prerequisite: [TODO-01: transparent ZK feasibility and shared format](../todos/01-transparent-zk-feasibility.md). Public copying/private-proof reuse and first-claim front-running are accepted weaknesses; a consumed entry still cannot yield another public claim.

## Workspace agreement

Use pnpm with a pinned package-manager version and shared lockfile. Scaffold a frontend workspace package and a contracts/tooling workspace package. The latter owns Solidity, Hardhat, contract tests, and deployment/maintenance scripts. Root commands orchestrate the workspace; filtered commands support focused work.

Expose generated public ABIs and deployment information through an explicit handoff. Do not import deployment secrets or Node-only tooling into the frontend. Additional packages require a demonstrated shared responsibility rather than speculative architecture.

This is an implementation requirement for the scaffold ticket, not a claim that application code has already been scaffolded.

## Ticket sizing rules

- One specialized user operation or verifiable lifecycle step per ticket.
- Include that operation's necessary contract/state work, application interaction, and behavioral tests together. Do not create separate contract, UI, and test tickets for the same operation.
- Each ticket includes its negative cases and authorization checks. Later tickets add new behavior, not permission to leave earlier behavior insecure.
- Prefer a small completed path over broad shared infrastructure. The initial workspace/runtime ticket is the unavoidable greenfield bootstrap and must still produce a runnable result.
- Use the complete feature-qualified identifier in cross-feature blocking references. Local numbering starts at 01 inside each feature's issues directory.
- Do not require an entire feature to finish when an earlier ticket provides the needed interface.

## Implementation tickets

All 33 ticket identifiers below link to individual issues containing the owning spec, explicit blockers, scope, and acceptance criteria. Each issue is labeled ready-for-agent; that triage label does not override unmet blockers.

The original implementation frontier was 01.01; determine the current frontier from individual ticket evidence. Treasury, funding, membership, proposal, voting, release, existing v1 recovery, and local scanning work do not depend on TODO-01. Publication and public claims need its approved shared credential/Merkle format; private proof implementation additionally needs qualified real browser/off-chain ZK. Do not wait for a Solidity ZK verifier, which is no longer required.

### Feature 01 — Browser application foundation

| ID | Specialized task | Blocked by | Verifiable result |
| --- | --- | --- | --- |
| [01.01](01-browser-foundation/issues/01-scaffold-pnpm-workspace.md) | Scaffold and run the pnpm workspace | None | Frontend and contracts/tooling packages install with one lockfile; the client builds without a backend, and package/root test commands plus local-chain startup are reproducible. |
| [01.02](01-browser-foundation/issues/02-connect-wallet-account.md) | Connect and track the wallet account | 01.01 | Connect, reject, switch accounts, and disconnect with accurate session state. |
| [01.03](01-browser-foundation/issues/03-validate-deployment-network.md) | Select and validate the deployment network | 01.02 | Read configured chain/deployment context; identify a wrong network and offer a safe switch. |

### Feature 02 — Treasuries, TestUSD, and voting membership

| ID | Specialized task | Blocked by | Verifiable result |
| --- | --- | --- | --- |
| [02.01](02-treasuries-and-membership/issues/01-create-treasury.md) | Create a treasury and assign its administrator | 01.03 | Any wallet creates a registered treasury using the shared TestUSD deployment and sees its identity and administrator. |
| [02.02](02-treasuries-and-membership/issues/02-browse-treasuries.md) | Browse treasuries and inspect balances | 02.01 | Read-only visitors discover treasury records and inspect administrators and current balances. |
| [02.03](02-treasuries-and-membership/issues/03-mint-testusd.md) | Mint TestUSD with its designated administrator | 02.01 | The currency administrator mints to a recipient; a treasury administrator without that role cannot. |
| [02.04](02-treasuries-and-membership/issues/04-fund-treasury.md) | Fund a treasury with TestUSD | 02.01 | A holder sends TestUSD and sees the confirmed treasury balance without unnecessary allowance prompts. |
| [02.05](02-treasuries-and-membership/issues/05-mint-voting-nfts.md) | Mint and inspect non-transferable voting NFTs | 02.01 | A treasury administrator issues voting credentials; holders see ownership and all transfer paths reject. |
| [02.06](02-treasuries-and-membership/issues/06-burn-voting-nfts.md) | Burn voting NFTs without reusing IDs | 02.05 | An administrator burns credentials, live supply updates, and subsequent mints use fresh IDs. |

### Feature 03 — Proposal authoring and IPFS publication

| ID | Specialized task | Blocked by | Verifiable result |
| --- | --- | --- | --- |
| [03.01](03-event-proposals/issues/01-markdown-editor-preview.md) | Write and safely preview a Markdown proposal | 01.01 | The organizer edits a draft and previews its content without unsafe HTML or links executing code; no chain transaction is needed. |
| [03.02](03-event-proposals/issues/02-pin-proposal-document.md) | Pin the reviewed proposal document to IPFS | 03.01 | The proposer supplies credentials, pins the exact versioned document, and receives a reference; failed uploads or later draft edits cannot masquerade as the same prepared document. |
| [03.03](03-event-proposals/issues/03-create-onchain-proposal.md) | Create an on-chain proposal referencing the document | 03.02, 02.01 | The creator fixes funding terms, deadline, and document reference, receives a DAO-wide incrementing ID, and can retry rejected submission without treating the upload as an on-chain proposal. |
| [03.04](03-event-proposals/issues/04-read-published-proposals.md) | Browse proposals and read published Markdown | 03.03 | Members and visitors find on-chain proposals and safely read their authenticated referenced documents; invalid or unavailable IPFS data is explained separately from missing proposals. |

### Feature 04 — Public voting

| ID | Specialized task | Blocked by | Verifiable result |
| --- | --- | --- | --- |
| [04.01](04-public-voting/issues/01-vote-yes-and-pass.md) | Cast a yes vote and automatically record passing | 03.03, 02.05 | An eligible NFT votes once before close; the current supply determines passing and passing closes voting. |
| [04.02](04-public-voting/issues/02-vote-no.md) | Cast a no vote | 04.01 | An eligible NFT records opposition, consumes its vote, and cannot later vote yes or vote again. |
| [04.03](04-public-voting/issues/03-record-passing-after-burns.md) | Explicitly record passing after NFT burns | 04.01, 02.06 | Anyone checks the live threshold before vote close; retained votes can pass after burns and remain passed afterward. |
| [04.04](04-public-voting/issues/04-inspect-public-voting.md) | Inspect public ballots and voting progress | 04.02, 04.03 | Read-only users see public ballots, totals, live thresholds, and open/passed/closed-without-passing outcomes independently of payment and attendance. |

### Feature 05 — Fund release

| ID | Specialized task | Blocked by | Verifiable result |
| --- | --- | --- | --- |
| [05.01](05-fund-release/issues/01-release-passed-proposal.md) | Release funds for an already passed proposal | 04.01 | Only the creator can collect the fixed payment once, including after vote close. |
| [05.02](05-fund-release/issues/02-retry-funding-shortage.md) | Show a funding shortage and retry payment | 05.01 | A passed proposal stays passed when underfunded; replenishing the treasury enables a later request. |
| [05.03](05-fund-release/issues/03-pass-during-release.md) | Record passing during a release request | 05.02, 04.03 | A qualifying open proposal passes during release, and insufficient funds do not roll back that passing result. |

### Feature 06 — Attendance credentials and scanning

| ID | Specialized task | Blocked by | Verifiable result |
| --- | --- | --- | --- |
| [06.01](06-attendance-credentials-and-scanning/issues/01-recover-attendance-qr.md) | Generate and recover an event attendance QR | 03.03 | A supported wallet reproduces the event secret; the QR reveals only the scoped hashed entry. |
| [06.02](06-attendance-credentials-and-scanning/issues/02-scan-attendance-qr.md) | Scan and validate attendance QR codes | 06.01 | The organizer accepts correct-event entries, rejects malformed or wrong-event scans, and deduplicates in-session. |
| [06.03](06-attendance-credentials-and-scanning/issues/03-persist-local-attendance.md) | Resume event scanning from localStorage | 06.02 | Reloading restores accepted entries for the correct deployment/event without mixing sets or introducing import/export. |

### Feature 07 — Attendance publication

| ID | Specialized task | Blocked by | Verifiable result |
| --- | --- | --- | --- |
| [07.01](07-attendance-publication/issues/01-prepare-attendance-set.md) | Prepare and preview a canonical attendance set | 06.03, TODO-01 | The organizer reviews a deterministic dataset/root with explicit immutable-finalization consequences. |
| [07.02](07-attendance-publication/issues/02-pin-attendance-set.md) | Pin the prepared attendance set | 07.01, 03.02 | The organizer reuses the established IPFS transport with their own credentials, uploads the exact attendance data, and can retry without leaking credentials. |
| [07.03](07-attendance-publication/issues/03-finalize-attendance.md) | Finalize the attendance root and reference on-chain | 07.02 | Only the organizer publishes once; rejected submissions remain retryable and funding status is irrelevant. |
| [07.04](07-attendance-publication/issues/04-validate-attendance-data.md) | Retrieve and validate the attendance set | 07.03 | Readers fetch the data, verify its root against the chain, and reconstruct canonical membership paths or receive an honest failure. |

### Feature 08 — Private off-chain attendance proofs

| ID | Specialized task | Blocked by | Verifiable result |
| --- | --- | --- | --- |
| [08.01](08-private-attendance-proofs/issues/01-prepare-private-witness.md) | Prepare a private attendance witness | 07.04 | The attendee recovers a credential and privately checks membership; missing membership is explained without exporting a secret. |
| [08.02](08-private-attendance-proofs/issues/02-generate-private-proof.md) | Generate and download a private proof | 08.01 | Real browser proving produces a versioned file containing no wallet, selected leaf, path, secret, or signature. |
| [08.03](08-private-attendance-proofs/issues/03-verify-private-presentation.md) | Import and verify an off-chain presentation | 07.03 | A wallet-free verifier authenticates the event root from the chain and accepts/rejects real proof files without trusting file-supplied verifier artifacts. |

### Feature 09 — Public attendance claims

| ID | Specialized task | Blocked by | Verifiable result |
| --- | --- | --- | --- |
| [09.01](09-public-attendance-claims/issues/01-prepare-public-claim-proof.md) | Prepare a public-claim secret and membership witness | 07.04 | An attendee consents to irreversible disclosure and prepares the secret/path, with copying and front-running warnings. |
| [09.02](09-public-attendance-claims/issues/02-submit-unique-public-claim.md) | Submit and enforce a unique public claim | 09.01 | Ordinary hash membership records the sender-event association and consumes the derived entry. Copied evidence may win the first claim, but cannot produce a second claim after consumption. |
| [09.03](09-public-attendance-claims/issues/03-browse-public-claims.md) | Browse public claims by event and wallet | 09.02 | Read-only visitors inspect confirmed associations without confusing attendance with voting approval or payment. |

## Parallel work

- After 01.01, Markdown editing can proceed independently of wallet integration and contract scaffolding beyond the initial workspace.
- After 02.01, treasury discovery, currency minting, treasury funding, NFT issuance, and proposal-contract integration can proceed independently against the established interfaces. Proposal-contract integration also needs the prepared-document interface from 03.02.
- Proposal IPFS publication is not blocked by TODO-01. Public proposal documents do not use the attendance tree or ZK proof format.
- After 03.03, public document reading, yes-vote work, and attendance QR generation can proceed independently. Yes-vote work additionally needs NFT issuance; attendance does not need successful voting or payment.
- Fund release and attendance scanning can proceed independently.
- Canonical attendance-tree publication needs the approved shared format from active TODO-01. Private proof generation/verification additionally needs qualified browser ZK. Public hash claims do not wait for private-proof UI or Solidity ZK compatibility. No mock proof may satisfy a real cryptographic acceptance criterion.
- After 07.03, off-chain verification can proceed using real benchmark fixtures and trusted verifier artifacts without waiting for proof-generation UI or the attendance-reader UI.
- After 07.04 and shared-format approval, private witness work and public secret/path claim work can proceed independently. Real private proving still requires its qualified prover/artifacts.

## Shared-interface coordination

- Treasury identity, shared TestUSD configuration, membership reads, proposal identity/terms/document reference, passing state, attendance references, and proof formats are integration contracts between features.
- Proposal authoring owns the Markdown/document format and general IPFS transport. Attendance publication owns the different cryptographic dataset format and root-finalization interaction. Reusing transport does not couple public proposal content to ZK feasibility.
- Establish each shared interface in its earliest owning ticket. Later tickets extend behavior without silently changing earlier semantics.
- Keep workspace ownership explicit: contracts and scripts belong to contracts/tooling; frontend modules consume public artifacts. Root tooling coordinates rather than becoming a catch-all implementation package.
- Avoid concurrent incompatible edits to shared contract state or deployment configuration. Coordinate those changes or land the owning interface first; separate features are not a promise of zero merge conflicts.
- Public hash membership and private ZK share credential/Merkle semantics, not a proof pipeline. Private presentations expose no stable entry identifier; public claims intentionally disclose the secret/path. New v2 hashing is authorized for investigation, not yet a selected format. Preserve frozen v1 behavior and never mix credential versions in a finalized set or reset claim consumption through a proof-format upgrade.
- Publish cross-feature blocker links in each ticket, not only in this overview.

## Testing agreement

The primary seam is the application action/read interface backed by real local contracts where transactions are involved. Markdown authoring also has a wallet-free browser path. Direct external contract calls cover permissions and bypass attempts. Real cryptographic round trips cover proof correctness once feasible. Replace external wallet/camera/IPFS/RPC transport only where deterministic tests need controlled failure or input, not the domain rules or verifier under test.

Implementation should follow the unblocked frontier and the strategic working rules in the project instructions. TODO-01 research and isolated qualification tests are authorized; production format and public-claim cost approval remain outstanding.
