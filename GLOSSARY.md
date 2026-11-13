# Organization DAO

An organization allocates funds to proposed events, and event organizers attest to attendance.

## Language

**Fund allocation**:
The approval and payout of treasury funds for an event, not verification of how the recipient subsequently spends those funds.
_Avoid_: Verified spending

**Attendance attestation**:
An organizer's assertion that a credential holder attended an event. It relies on the organizer's attendance checks rather than independently establishing physical presence.

**Attendance credential**:
Transferable evidence of an organizer's attendance attestation; possession does not establish the holder's personal identity.

**Voting NFT**:
A non-transferable, treasury-associated credential granting one public vote per proposal. A trusted administrator controls minting and burning; newly minted credentials may vote on proposals already open, and a token's identifier can be used only once per proposal.
_Avoid_: Voter eligibility root

**Approval threshold**:
The minimum number of yes votes required to approve an open proposal: `floor(current voting NFT supply / 2) + 1`. Newly minted NFTs may vote, burning NFTs can lower the threshold, and previously cast votes remain counted after burning.
_Avoid_: Participation quorum

**Passed proposal**:
A proposal whose yes votes met the approval threshold and whose passing result was recorded while voting was open. Passing closes voting and remains valid even when treasury funds are insufficient; an explicit `passed` check can record the result after NFT burns lower the threshold.

**Vote close**:
The end of a proposal's voting period, either when passing is recorded or when its deadline arrives. Closing the vote does not prevent the event creator from releasing funds for a passed proposal later.
_Avoid_: Proposal expiry

**Fund release**:
The event creator's request to transfer an approved proposal's funding from its treasury. Insufficient treasury funds delay release rather than cancel approval; attendance collection does not depend on fund release.

**Funding state**:
Where a proposal's payment stands, derived from chain state when read and independent of voting and attendance. It is one of: not passed, passed awaiting funds, payment pending, payment failed, or paid. Passing never reserves treasury funds, so the state follows the treasury balance at read time.

**Passed awaiting funds**:
A passed, unpaid proposal whose treasury balance is currently below its amount. It takes precedence over payment failed: a shortage reads as awaiting funds whatever an earlier attempt did, and the creator may retry once the treasury is replenished.

**Payment pending**:
A passed, unpaid proposal that is currently fundable: the treasury balance covers its amount and the latest release attempt, if any, was not a refused transfer. It does not mean a transaction is in flight.
_Avoid_: In-flight payment, processing

**Payment failed**:
A passed, unpaid proposal whose latest release attempt found sufficient balance but was refused by the funding asset's transfer; nothing was paid. It persists until a later attempt hits a shortage or pays, since only an attempt can show the asset has recovered. It remains retryable by the event creator.

**Paid**:
TestUSD actually moved to the proposal's fixed recipient, exactly once. A successful release receipt alone is not proof; only the payment event or paid state is.

**Treasury**:
An event-funding pool that anyone can create through the DAO. Its creator is its administrator and controls minting and burning of that treasury's voting NFTs; the DAO has no administrator.

**Event proposal**:
A globally identified request for event funding from one treasury. Its organizer may attest attendance regardless of whether the proposal passes or receives funding; creation does not require any voting NFTs to exist.

**Proposal document**:
The public description of an event and its funding request, published by the organizer so members can understand the proposal. It is distinct from the event's later attendance attestations.

**TestUSD**:
The shared POC test currency held by treasuries and used to fund event proposals. A separately designated TestUSD administrator can mint it; treasury administration does not confer currency-minting authority.

**Event organizer**:
The proposal creator, who alone is authorized to finalize that event's attendance attestations.

**Attendance root**:
The immutable commitment to an organizer's set of attendance attestations, published once after attendance collection ends.

**Published attendance set**:
The public, deduplicated collection of hashed attendance entries from which membership paths can be reconstructed. It excludes names, wallet addresses, raw attendance secrets, and wallet signatures.

**Private attendance presentation**:
Evidence of attendance that reveals the event but not the holder's wallet or their entry in the published attendance set.

**Public attendance claim**:
An opt-in, permanent public association between a wallet and an event, established without publishing the attendance secret. Each credential permits only one public claim; its proof is bound to the claiming wallet. Public voting may also reveal associations, without implying attendance.

**Off-chain attendance proof**:
An attendance proof verified outside the blockchain against the event's attendance root obtained from the blockchain. It does not require disconnected verification.
_Avoid_: Offline proof
