# 01: Generate and recover an event attendance QR

**ID:** 06.01
**Spec:** [Feature 06: Recoverable attendance credentials and local scanning](../spec.md)
**What to build:** An attendee uses a supported wallet to generate an event-specific attendance QR and recover the same credential later by signing the same message again.
**Blocked by:** [03.03 — Create an on-chain proposal referencing the document](../../03-event-proposals/issues/03-create-onchain-proposal.md).
**Status:** in-progress (automated parts done; real-wallet smoke check NOT executed)

## Acceptance criteria

- [ ] Freeze the exact versioned signing-message serialization, including application label, chain ID, canonical DAO address, and proposal ID, with canonical address representation and a specified signing method.
- [ ] Derive the secret using SHA-256 over ABI-encoded signature and proposal ID, then derive the QR entry using SHA-256 over ABI-encoded proposal ID and secret. Fix ABI types and signature-byte handling with reproducible vectors.
- [ ] Document and test a real supported wallet/signing method that reproduces the signature; explain that recovery is not guaranteed for all wallets or account migrations.
- [ ] The QR includes chain ID, DAO address, proposal ID, and hashed entry only. It excludes the secret, signature, attendee address, and names; never request the raw private key.
- [ ] Repeat signing with the supported account/method recovers the same event entry, while different event/deployment inputs remain separated.
- [ ] Any attendee can prepare a credential without voting NFTs or successful funding. Wallet rejection and account/network changes do not produce a stale successful credential.
- [ ] Tests verify vectors, recovery and separation, QR contents, signing failure, and no secret/signature in public outputs or logging; include a real supported-wallet recovery smoke check.

## Scope

No Merkle-tree format, proof system, non-transferable identity, or promise of independent physical attendance is introduced. This ticket is not blocked by transparent-ZK research.

## Comments

- Implemented `attendance.ts` (message, secret, entry, QR) plus `app.prepareAttendanceCredential` and `WalletAdapter.signMessage` (personal_sign). Vectors and recovery/separation/failure/privacy tests pass through the application seam. Format documented in `docs/attendance-credentials.md`. The real-wallet recovery check is documented as a manual procedure only; it was not run here (no browser wallet available).
- Review follow-up: signing-error mapping now lives only in the browser adapter (`normalizeWalletError`); secret derivation is private to `attendance.ts` (`deriveAttendanceCredential`); proposal IDs are range-checked before signing (`invalid-proposal-id`); adapter `signMessage` is tested via a fake provider.
- OUTSTANDING: the "real supported-wallet recovery smoke check" acceptance item and the documented real-wallet reproduction are NOT done. No real wallet has been run; only a local-key vector is tested. This ticket must not be closed until the manual check in `docs/attendance-credentials.md` is executed.
