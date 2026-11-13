# Attendance credentials (spec 06, version 1)

Implementation: `packages/frontend/src/attendance.ts`; action
`prepareAttendanceCredential` in `application.ts`. Vectors are frozen in
`attendance.test.ts`.

## Frozen serialization

- Signing method: EIP-191 `personal_sign` over the UTF-8 message. The browser
  adapter sends the hex-encoded message and the account; no private key is ever
  requested.
- Message, four lines joined by `\n`, no trailing newline:

  ```
  DAO for Clubs attendance v1
  Chain ID: <decimal chain id>
  DAO: <EIP-55 checksummed DAO address>
  Proposal ID: <decimal proposal id>
  ```

- Secret = `sha256(abi.encode(bytes signature, uint256 proposalId))`, using the
  65-byte `r || s || v` signature exactly as the wallet returns it.
- Entry = `sha256(abi.encode(uint256 proposalId, bytes32 secret))`.
- QR (JSON): `{ v, chainId, dao, proposalId, entry }` only. No secret,
  signature, attendee address, or name.

## Recovery limits

Recovery means the same account and signing method reproduce the same
signature. ECDSA wallets using RFC 6979 deterministic nonces should do, but
this is NOT verified here against any real wallet (MetaMask included); only the
local-key vector in the automated tests is verified. Recovery is not guaranteed for wallets with
randomized signatures, smart-contract or multisig accounts, hardware wallets
whose firmware differs, or after an account migration. A different signature
yields a different, unrelated entry.

## Real-wallet smoke check (manual)

Automated tests use a deterministic local key (Hardhat account #0) as the
signing vector and a fake EIP-1193 provider for the browser adapter. No real
wallet has been tested. To confirm one, run this manual check (untested):

1. Run the app with a deployment configured and connect MetaMask (EOA) on the
   deployment chain.
2. Prepare an attendance credential for a proposal ID and note the entry in the QR.
3. Disconnect, reload, reconnect the same account, prepare again: the entry must
   be identical. Switching to another account must produce a different entry.

Status: NOT executed. Until someone runs it, wallet recovery is unconfirmed.
