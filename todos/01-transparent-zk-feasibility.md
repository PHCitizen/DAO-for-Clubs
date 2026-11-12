# TODO-01: Validate transparent attendance proofs

Status: ready-for-agent
Type: research
Execution: deferred at the user's request; do not start as part of specification work.

## Purpose

Select and benchmark a transparent proof system for the agreed attendance credentials before proof-dependent implementation commits to a cryptographic format. This is an engineering feasibility investigation, not permission to change the product requirements.

## Requirements to preserve

- No trusted setup ceremony, including a hidden dependency on a trusted setup in a recursive wrapper or on-chain verifier.
- Browser-side proof generation without an application backend.
- Private off-chain verification against an authenticated attendance root read from BNB Smart Chain testnet.
- An opt-in public claim verified on-chain, bound to the claiming wallet, without revealing the attendance secret.
- One public claim per attendance credential, enforced with a per-credential nullifier.
- Event/deployment separation, transferable credentials, and organizer-attested attendance.
- The agreed SHA-256 secret and QR-entry derivation. Any proposed change requires explicit approval rather than silently replacing it.

## Investigation

- Compare primary-source documentation and working implementations for candidate transparent systems.
- Identify every setup assumption throughout the complete proving and verification pipeline.
- Test browser compatibility, required WASM/workers, artifact sizes, memory, and proving/verification time on documented hardware and browsers.
- Measure on-chain verification gas, calldata size, deployment size, and actual compatibility with BNB Smart Chain testnet constraints.
- Exercise the real attendance statement: knowledge of a secret yielding a published QR entry and Merkle membership in the event's finalized root.
- Exercise the public-claim statement with wallet binding, event/deployment separation, and a constrained nullifier. Check wrong recipient, altered event/root, proof replay, and duplicate-credential claims.
- Specify canonical Merkle hashing, leaf ordering, duplicate treatment, odd-leaf behavior, empty-set handling, maximum supported attendance size, and membership-path encoding.
- Specify versioned proof artifacts, public inputs, verification-key identification, and how private presentations avoid leaking a stable entry identifier.
- Establish reproducible vectors shared by browser generation, off-chain verification, and the on-chain verifier.

## Deliverables

- Evidence-backed recommendation with alternatives and setup assumptions.
- Reproducible benchmark commands and measured results, not estimated performance claims.
- A supported proof configuration and concrete limitations, or an explicit finding that the current requirements are not feasible within the POC constraints.
- A versioned cryptographic format agreement usable by attendance publication and both proof features.
- An explicit list of implementation tickets unblocked by the result.

## Blocking policy

Treasury creation, TestUSD funding, voting NFTs, proposals, voting, fund release, signature recovery, and local QR collection can proceed without this investigation.

Production-format attendance-tree publication and real proof generation/verification must wait for this investigation's cryptographic format agreement. Development fixtures may test their interfaces but must not be represented as genuine ZK proofs or finalized production-compatible commitments.

## Comments

The user requested deferring this investigation while creating feature specs and implementation tickets.
