# Feature 02: Treasuries, TestUSD, and voting membership

Status: ready-for-agent

## Problem Statement

Organizations need independently managed funding pools and voting membership without relying on a DAO-wide administrator. Users must distinguish authority over voting credentials from authority to mint the POC's currency.

## Solution

Allow any wallet to create a treasury through the DAO, inspect its balances, fund it with shared TestUSD, and administer its non-transferable voting NFTs. Keep TestUSD minting under its separately designated administrator.

## User Stories

1. As a wallet holder, I want to create a treasury, so that my organization can fund event proposals.
2. As a treasury creator, I want to become its administrator, so that I can manage voting membership.
3. As a visitor, I want to discover treasuries, so that I can choose the relevant organization.
4. As a visitor, I want to inspect a treasury's administrator and TestUSD balance, so that I can understand its authority and available funds.
5. As a TestUSD administrator, I want to mint currency, so that demo participants can fund treasuries.
6. As a treasury administrator, I want my currency-minting permissions kept separate, so that treasury membership does not imply control of TestUSD supply.
7. As a TestUSD holder, I want to fund a treasury, so that passed event proposals can receive payment.
8. As a treasury funder, I want to see a confirmed balance change, so that I know the deposit succeeded.
9. As a treasury administrator, I want to mint voting NFTs to officers, so that they can vote on my treasury's proposals.
10. As an officer, I want to see my voting NFTs, so that I know which treasury I can vote in.
11. As a treasury administrator, I want to burn voting NFTs, so that I can change active membership.
12. As a participant, I want voting NFTs to be non-transferable, so that only the administrator can change membership.
13. As a participant, I want burned IDs never reused, so that old proposal consumption records cannot be confused with new credentials.
14. As a participant, I want unauthorized minting and burning rejected on-chain, so that bypassing the UI cannot change membership.
15. As a participant, I want one treasury's membership isolated from another's, so that my voting power does not cross organizations.
16. As a voter, I want current NFT supply visible, so that I can understand the live approval threshold used by proposals.

## Implementation Decisions

- The DAO has no administrator. Its treasury-creation action is permissionless and deploys a new Treasury contract, recording its creator as treasury administrator.
- Establish the treasury registry and read interface used by proposal creation and public treasury views.
- All treasuries use one shared ERC20 TestUSD deployment. Its minting administrator is designated separately; creating a treasury grants no TestUSD minting permission.
- Expose ordinary TestUSD funding and balance inspection. Handle ERC20 allowance only if the chosen deposit interaction requires it; the UI must not assume approval is required for a direct transfer.
- Scope voting NFT ownership, live supply, minting, and burning to a treasury. Implementation may encapsulate this in dedicated contracts or modules, but treasury identities and token IDs must be unambiguous to callers.
- Only that treasury's administrator can mint and burn its voting NFTs. Transfers must fail through every exposed transfer path, not merely be absent from the UI.
- Token IDs never repeat within a treasury, including after burning. One wallet may hold multiple voting NFTs; voting weight is per token, not per address.
- Minting and burning affect the live supply used by open proposals. This feature does not implement proposal snapshots or erase historical votes.
- The treasury exposes a narrowly authorized proposal-payment integration for fund release; membership administration must not silently create an unrelated administrator withdrawal feature.
- Treasury creation and membership changes expose enough public state or events for discovery, inspection, and later proposal interactions without a backend indexer.

## Testing Decisions

- Test treasury creation, TestUSD funding, and NFT administration through the application action/read interface backed by a real local EVM.
- Assert externally observable administrator identities, balances, NFT ownership, live supply, and reverted unauthorized calls.
- Direct contract tests attempt unauthorized mint/burn, transfer overloads, reused IDs after burning, cross-treasury token use, and unauthorized currency minting.
- Exercise multiple treasuries and multiple NFT holders rather than relying on a single privileged account fixture.
- Use the foundation's harness. No older domain implementation or analogous tests exist to preserve.
- Each specialized workflow includes its own tests and UI confirmation; do not split contracts, UI, and tests into separate implementation tickets.

## Out of Scope

- Transferable or delegated voting NFTs, elections of administrators, DAO-wide administrators, membership snapshots, and identity verification.
- Mainnet currency, additional treasury assets, fiat conversion, and currency economics.
- General treasury withdrawals, expense auditing, proposal voting, and event payouts beyond the integration required by their owning features.

## Further Notes

This feature follows the browser foundation. Once treasury identity and membership interfaces exist, proposal work and currency-funding work can proceed independently. Administrator-driven supply changes are an explicit POC trust assumption, not a governance exploit this scope promises to eliminate.
