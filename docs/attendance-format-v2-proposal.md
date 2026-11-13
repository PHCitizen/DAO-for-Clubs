# Attendance v2 — approved POC agreement

**APPROVED FOR THE POC.** The user explicitly approved all four decisions below after reviewing the proposal and functional evidence. TODO-02 is resolved and feature 07's cryptographic-format gate is cleared; its ordinary ticket dependencies still apply. This agreement is not a production module, a cryptographic audit, or private-proof security/performance acceptance. Existing v1 remains frozen in `attendance-credentials.md`. Chrome is the sole browser target.

## Approved decisions

1. The pinned BN254 Poseidon2 T4 **feed-forward** construction below, including its fixed domain constants and fixed-length recovery/context folds. Primitive interoperability is not review of this construction's security. Do not infer 128-bit collision security from a ~254-bit output.
2. Canonical field encodings, EIP-191 recovery message/signature restrictions, and regenerated v2 QR entries.
3. Numeric ascending entry order, deduplication, fixed depth 10, right-hand empty padding, maximum 1,024 unique entries, and a count-bound root (including empty/singleton behavior).
4. One credential version fixed at event creation; only new v2 events, no existing-event migration, no mixed versions or replacement roots. Proof-format upgrades cannot reset entry consumption.

The implementation seam is intentionally small: recover secret → derive entry; build/validate dataset → root and path; verify membership → derived entry. No configurable hash/tree framework, production contract changes, deployments, or Solidity ZK verifier are included.

## Exact primitive and domains

Field prime `p = 21888242871839275222246405745257275088548364400416034343698204186575808495617`.

- Noir: `TaceoLabs/noir-poseidon@36c8db5a86795038822323dee790dd760372766d` (v0.6.2), `poseidon2::bn254::permutation::t4`.
- Solidity: `TaceoLabs/poseidon2-solidity@4c599a08a45cd465a153d724425cee331c010df1`, `Poseidon2T4_BN254.compress` **checked** API.
- Width 4, BN254 scalar field, upstream x^5 S-box, 8 full / 56 partial rounds and exact upstream matrices/constants. Pin commits, not merely the Poseidon2 name. No primitive patches or black-box substitution.
- Define `H(d,a,b) = (permutation_t4([d,a,b,0])[0] + d) mod p`. This is the upstream feed-forward compression, **not** raw lane-zero projection. Exactly four lanes, zero fourth lane, no additional sponge, padding blocks, byte reduction or implicit length encoding.

| Purpose | Decimal domain |
|---|---:|
| recovery fold | 1 |
| entry | 2 |
| leaf | 3 |
| empty leaf | 4 |
| context fold | 5 |
| final root | 6 |
| count/root pair | 7 |
| parent at leaf-up level `i`, `0 <= i < 10` | `16+i` |

All hash arguments must be canonical fields. Reject out-of-range input **before** field conversion; never silently reduce external integers. The two fixed-length folds below are the only iterated application construction. This domain/arity/folding choice is a **proposal requiring approval/security consideration**, not an audited standard sponge. Upstream Solidity remains unaudited.

## Encodings and event context

- Field string: exactly `0x` followed by **64 lowercase hex digits**, integer `< p`; includes zero and `p-1`. No alternate case, short hex, whitespace, negative, decimal field strings, or `p`/larger aliases. Bytes/ABI use the same unsigned integer in 32-byte big-endian form (`uint256`).
- Chain/proposal identifiers: unsigned uint256; JSON/signing messages use shortest base-10 strings (`0` or nonzero first digit); no JSON-number identifiers. No modulo-field reduction of these IDs.
- DAO: exactly 20 bytes; canonical dataset/QR spelling is `0x` + 40 lowercase hex digits. Signing message uses EIP-55 checksum, as v1 does. No wallet address is included in the public attendance dataset.
- `limbs(x) = [floor(x/2^128), x mod 2^128]`, high limb first. These limbs are independently canonical fields. DAO fits in one field without truncation.
- `ctx`: start `state = 2` (credential version); fold the **five** words `[chainHi,chainLo,dao,proposalHi,proposalLo]` in order with `state = H(5,state,word)`. Final state is `ctx`. This binds chain, deployment, event and credential version without reducing a 256-bit ID to a field.

## Recovery, entry and QR

Sign the following exact four lines with EIP-191 `personal_sign` over UTF-8, LF separators, **no trailing newline**:

```text
DAO for Clubs attendance v2
Chain ID: <canonical decimal>
DAO: <EIP-55 checksummed address>
Proposal ID: <canonical decimal>
```

Support only a tested deterministic EOA signing method, not universal wallets or contract wallets. Never ask for a private key. Normalize the RPC's recovery byte 0/1 to 27/28; then serialize exactly 65 bytes `r[32] || s[32] || v[1]`, big-endian. Require `0 < r < secp256k1_n`, `0 < s <= n/2`, and `v in {27,28}`; reject high-s rather than silently deriving a different secret. Compact EIP-2098 and ERC-1271 signatures are not accepted. Production recovery must also verify the signature against the selected wallet and exact message; the field-fold fixture tests derivation, not a wallet integration.

Starting `state=ctx`, fold **five** words `[rHi,rLo,sHi,sLo,v]` with `state=H(1,state,word)`. Final state is `secret`. `entry=H(2,ctx,secret)`. Recovery is browser-side only; private membership/public claims require possession of the secret, **not** verification of its wallet-signature origin. Do not put signatures or secrets in QR/IPFS. The deterministic fixture uses a visibly public test key, never a user credential.

QR JSON has exactly these keys in this order, UTF-8, no whitespace or trailing newline:

```json
{"schema":"attendance-qr/v2","chainId":"97","dao":"0x1234567890abcdef1234567890abcdef12345678","proposalId":"42","entry":"<canonical field>"}
```

Reject another schema/version/event/deployment. v1 scans cannot be relabeled v2; regenerate QR entries by re-signing the v2 message.

## Dataset and fixed tree

Construction accepts canonical entries, deduplicates by integer equality and sorts numerically ascending. Fixed-width lowercase strings have identical lexical order. Limit **unique** entries to 1,024; do not truncate. Published datasets must already be strictly ascending and unique: readers **reject**, not repair, duplicates or reordered entries.

`leaf(entry)=H(3,ctx,entry)`. `empty=H(4,ctx,0)` is a distinct tagged padding leaf, not entry zero. Fill positions 0..count-1 with sorted entry leaves and all remaining positions through 1023 with `empty`. At level i starting from leaves, pair ordered left/right children using `H(16+i,left,right)`. Never sort children; never duplicate an odd last leaf, promote it, or use a variable tree depth. Thus odd sizes use the same right padding rule as every other size.

After ten levels obtain `treeRoot`. Final `root=H(6,ctx,H(7,count,treeRoot))`. An empty set hashes 1,024 empty leaves through the same ten levels and binds count 0; it has a valid root but **no valid membership path**. A singleton hashes its one real leaf and 1,023 empty leaves through all ten levels; its root is not its leaf/entry. Root zero is not an unfinalized sentinel; use an explicit finalized flag.

Canonical publication bytes are UTF-8 compact JSON, no BOM/whitespace/trailing newline, exact key order:

```json
{"schema":"attendance-set/v2","chainId":"97","dao":"0x1234567890abcdef1234567890abcdef12345678","proposalId":"42","entries":["<canonical field>"]}
```

No extra keys, secrets, signatures, names, attendee wallet addresses, pinning credentials, or separately authoritative root. Readers reject noncanonical encodings (including duplicate JSON keys via exact canonical re-encoding comparison), unsupported schemas, unsorted/duplicate entries, excessive counts and context mismatch; then recompute root/count and compare both with authenticated chain state. The fixture is not a production JSON validator; that integration remains feature 07. Preview/pin the exact canonical bytes, not a mutable live scan list. IPFS content is public and still requires pinning availability.

## Paths and membership interface

Proposed path JSON: `{"schema":"attendance-path/v2","index":0,"siblings":["<field>","... ten total ..."]}` with the same compact canonical JSON rules. `index` is an integer JSON number, `0 <= index < authenticated count <= 1024`. Siblings are exactly ten canonical fields, leaf-up. Direction at level i is `(index >> i) & 1`: 0 means current node on left, 1 on right. There is no independently supplied direction array, variable depth, or caller-supplied entry/consumption key.

Public Solidity interface proposal: `claimAttendance(uint256 proposalId,uint256 secret,uint16 index,uint256[10] siblings)`. It reads the immutable event version, root and count; derives ctx from `block.chainid`, `address(this)` and proposalId; checks canonical fields and index bounds; derives entry/leaf, reconstructs the ten parents and final root; rejects a mismatch; rejects an already consumed entry; and **atomically** marks `consumed[proposalId][entry]` and records `msg.sender`. Invalid claims change no state. No recipient parameter or ZK verifier. Count is stored with root/reference at the one authorized organizer finalization; it is not caller-selected.

Private relation in `main.nr`: public `[ctx,count,root]`, private `[secret,index,siblings[10]]`; range-constrain count/index and perform the identical entry/leaf/tree/final-root calculation. The verifier independently derives expected ctx and reads immutable root/count from the configured chain/DAO/event, checks the immutable credential version and uses only approved proof configuration artifacts. A proof's own public inputs are not authoritative chain data. Recovery signatures are not witnesses. The path index, entry and secret are not public inputs.

## Version and disclosure policy

For the POC, select v2 only for newly created events with an immutable version set **before collection starts**. Existing v1 event behavior remains unchanged; no retroactive v1 tree interpretation, migration, dual-root publication, replacement or version setter. Until approval/implementation, no event starts using this proposal. Future private proof-format versions may prove the **same** immutable credential/root relation, but must never create a new public-claim consumption namespace. Public consumption is event/deployment + derived entry, not proof-artifact/version + entry. There is no upgrade mechanism in this proposal.

The public transaction permanently discloses secret/path. Anyone can copy it, generate private presentations forever, or front-run the first claim to associate their own wallet. This is accepted, must be warned before submission, and does not revoke private presentations. One consumed entry is not one person: signature variation, multiple credentials/wallets and credential sharing remain possible. Attendance is an organizer attestation, independent of funding or voting.

## Evidence and approval boundary

Durable source, vectors and reproduction live in `packages/contracts/scripts/attendance-v2/`; see its README. Tests use the **actual pinned Solidity primitive** in a local EVM to generate the selected feed-forward outputs and tree paths, then assert them with the **actual pinned Noir arithmetic primitive**. They do not compare two copies of a handwritten TypeScript permutation. Deterministic construction code is isolated under contracts tooling; no production/frontend imports or behavior changes.

Execution results are recorded in the fixture README. Compilation/native execution is not a Chrome proof. TODO-01 retains private Chrome proof budgets (60 s / 1 GiB / 50 MiB), entropy/privacy/unlinkability/security qualification and approved prover/verifier artifacts. In particular, ProveKit v1.0.2's three unresolved **unused `FinalClaim` must-be-used** verifier warnings remain unresolved; no primitive/format vectors discharge them. Native↔Chrome proof incompatibility is documented, not a Chrome-only publication prerequisite. Public-claim gas/cost measurements and actual wallet recovery integration are not established by this fixture.

Approval of this proposed format alone can clear feature 07's format gate; it does not approve private ZK production or assert an audited cryptographic construction. Keep TODO-02 in progress until the user explicitly approves the exact decisions above.
