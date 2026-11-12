# DAO for Clubs — Hackathon POC

## Purpose

A browser-only application for schools and organizations to allocate treasury funds to event proposals and issue privacy-preserving attendance credentials.

The POC addresses two problems:

1. **Fund allocation transparency:** publicly inspect proposals, votes, and treasury payouts. It does not verify how organizers spend funds after receiving them.
2. **Verifiable attendance attestations:** verify that an organizer included a credential in an event's published attendance set, without contacting the organizer or exposing a public list of attendees' identities.

Attendance is organizer-attested, not independently proven physical presence. Organizers can include absent people, and credential holders can share their credentials. These limitations are accepted for the POC.

See `GLOSSARY.md` for canonical terminology.

## DAO and treasuries

- The DAO has no administrator.
- Anyone can call the DAO to deploy a new Treasury contract.
- The treasury creator becomes its administrator and can mint and burn that treasury's voting NFTs.
- Voting NFTs are non-transferable. Burned token IDs must never be reused.
- All treasuries use one shared ERC20 TestUSD contract as their funding asset.
- A separately designated TestUSD administrator can mint currency. Treasury administration does not grant TestUSD minting authority.
- Multiple proposals can use the same treasury.

## Proposals

- Any user can create an event proposal against a treasury.
- The DAO assigns a globally unique, incrementing proposal ID and stores proposals in a mapping.
- The organizer writes the proposal's event information using a Markdown editor with a preview.
- Publish the proposal document to IPFS using proposer-provided pinning credentials before creating its on-chain record. No shared frontend service secret or backend is introduced.
- Each proposal fixes its treasury, creator, requested TestUSD amount, payout recipient (the creator), voting deadline, and proposal-document IPFS reference when created.
- Members and other visitors can retrieve and safely render that published document to understand the request. It is public information, separate from the later attendance dataset.
- Pinning a document does not create a proposal. If upload or the blockchain transaction fails, show the correct stage and allow retry without claiming publication succeeded on-chain.
- Published proposal content and funding terms cannot be replaced after creation. Markdown authoring is for drafts, not post-publication amendment.
- Render untrusted Markdown safely; embedded scripts or unsafe links must not execute as application code.
- The proposal creator is also the event organizer.
- Proposal creation is allowed even when the treasury has no voting NFTs.
- Attendees do not need voting NFTs; voting may be limited to officers while attendance is open to others.

## Voting and passing

- Voting is public and wallet-based, with yes/no choices.
- Each voting NFT can cast one unchangeable vote per proposal. Record consumption by proposal and token ID to prevent reuse.
- The voter must hold a voting NFT belonging to the proposal's treasury.
- There is no snapshot of eligible voters or NFT supply. Newly minted NFTs can vote on proposals already open.
- The required number of yes votes is:

  ```text
  floor(current treasury voting NFT supply / 2) + 1
  ```

- Burning NFTs can lower the threshold. Votes already cast remain counted even if their NFTs are burned.
- With zero NFTs, the threshold is one. A proposal cannot pass without a yes vote, but a subsequently minted NFT can vote.
- A vote transaction records the proposal as passed if it reaches the current threshold.
- Anyone can call `passed(proposalId)` while voting is open to check the current threshold and record passing. This supports cases where NFT burning makes existing yes votes sufficient.
- Recording passing closes voting immediately. Later minting or burning cannot undo that result.
- Otherwise, voting closes at the fixed deadline. No votes or new passing result can be recorded afterward.
- If no transaction recorded passing before vote close, the proposal has not passed, even if a threshold was temporarily satisfied earlier.

The treasury administrator is trusted: minting and burning can influence voting outcomes.

## Fund release

- Only the proposal creator can request release of its approved funding.
- While voting remains open, a release request may check the threshold and record passing before attempting payout.
- Passing and payment are separate results. Recording passing must not depend on sufficient treasury funds.
- If funds are insufficient, retain the passed result and allow the creator to request release again after the treasury receives more TestUSD.
- Each proposal can be paid only once, for its fixed amount and to its fixed recipient.
- A passed proposal can receive funds after vote close. Closing voting does not expire its right to payment.
- Multiple passed proposals may wait for funding from the same treasury; passing does not reserve funds.

## Attendance credentials and recovery

The browser must never request a wallet's raw private key.

Use a reproducible wallet signature over an event-specific message:

```text
dao-for-clubs attendance secret v1
chainId: <chain ID>
contract: <canonical DAO contract address>
proposalId: <proposal ID>
```

Derive the secret and QR entry as follows:

```text
signature = sign(exact event-specific message)
secret = sha256(abi_encode(signature, proposalId))
qrValue = sha256(abi_encode(proposalId, secret))
```

- Fix the exact message serialization, address representation, signing method, and ABI types before implementation so recovery reproduces the same inputs.
- Scope the POC to a tested wallet/signing method that reproduces the same signature. Universal recovery across wallets, especially smart-contract wallets, is not promised.
- Re-signing the same message recovers the attendance secret with the supported wallet.
- Keep signatures and secrets private. Neither belongs in QR codes, IPFS data, nor blockchain transactions.
- Attendance credentials are transferable: sharing the underlying secret enables someone else to prove attendance. A proof establishes credential possession, not personal identity.

## Attendance collection and publication

1. The attendee displays a QR containing the chain ID, DAO address, proposal ID, and `qrValue`.
2. The organizer scans it without a blockchain transaction.
3. The scanner checks the event/deployment identifiers and deduplicates identical entries.
4. Store the collected entries in browser localStorage. For the POC, assume browser data is not cleared; there is no scan-list import/export, cross-device synchronization, or delegated scanner permission system.
5. After attendance collection ends, the organizer manually finalizes attendance.
6. Publish the hashed attendance set and the information needed to reconstruct Merkle paths to IPFS, then record the attendance root and IPFS reference on-chain.

Only the proposal creator can finalize attendance. Publication is allowed exactly once and is immutable: no corrections or late additions afterward. Show a clear warning before finalization.

Attendance collection and publication are independent of voting and payment. A proposal that never passed or received funds can still have an attendance attestation. An attendance proof must not imply DAO approval or funding.

### IPFS and privacy

- Published data contains hashed attendance entries, not names, wallet addresses, secrets, or signatures.
- Treat IPFS data as public; privacy depends on hiding the association between a person and an entry, not hiding the IPFS reference.
- The organizer supplies their own IPFS pinning credentials. Do not embed shared service secrets in frontend code or publish credentials on-chain.
- Durable hosting requires pinning. Availability of the published data remains an operational dependency for retrieving membership paths.

## Attendance proofs

### Private off-chain presentation

- The attendee generates a ZK proof in the browser and can save it to a file.
- The verifier obtains the event's attendance root from the blockchain and verifies the proof outside the blockchain.
- The proof reveals the event, but not the holder's wallet, secret, or entry in the published attendance set.
- This is **off-chain**, not necessarily disconnected/offline verification. A proof file supplied by an attendee is not by itself an authenticated source of the event root.
- Credentials and presentations are transferable; proving attendance does not establish the presenter's personal identity.

### Opt-in public claim

- The attendee can publish a permanent wallet–event association on-chain.
- Use a ZK proof bound to the claiming wallet; do not reveal the attendance secret.
- A per-credential nullifier permits only one public claim for that credential.
- A copied transaction proof must not permit claiming for a different wallet.
- Public voting can also reveal associations between wallets and events. This is acceptable for the POC and does not itself establish attendance.

### Proof-system requirements and feasibility

- Require a transparent proof system: no trusted setup ceremony.
- Support browser-side proving, off-chain verification, and public-claim verification on BNB Smart Chain testnet.
- The concrete proof system is not selected yet. Benchmark browser performance and on-chain verification gas before committing to an implementation.
- Validate the cost of the SHA-256 credential/Merkle construction and any necessary circuit or VM integration during that feasibility work. Do not silently relax the transparent-setup requirement.

## Technology and deployment

- BNB Smart Chain testnet
- TanStack Start, client-side only
- React and Tailwind CSS
- TypeScript and viem
- Solidity and Hardhat
- Vitest
- Node.js for development/build tooling
- pnpm as the package manager, with a pnpm workspace and shared lockfile
- A frontend workspace package for the client application
- A contracts/tooling workspace package for Solidity, Hardhat, contract tests, and deployment/maintenance scripts
- Explicit ABI and deployment-information handoff to the frontend; no frontend imports of private deployment credentials or Node-only tooling
- IPFS for public proposal documents and published attendance data
- No application backend; application execution, scanning, and proof generation happen in the browser, with blockchain RPC and organizer-configured IPFS services as external dependencies

## Explicit POC exclusions

- Expense verification, spending audits, or staged payouts
- Independent proof of physical presence or non-transferable personal identity
- Anonymous voting
- Voting NFT transfers, delegation, or membership snapshots
- Organizer replacement or delegated attendance scanners
- Attendance edits after publication
- Attendance-list import/export, backup recovery, or device synchronization
- Universal wallet-signature reproducibility
- An application-operated backend or embedded shared IPFS credentials
