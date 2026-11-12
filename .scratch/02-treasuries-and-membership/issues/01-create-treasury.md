# 01: Create a treasury and assign its administrator

**ID:** 02.01
**Spec:** [Feature 02: Treasuries, TestUSD, and voting membership](../spec.md)
**What to build:** Any connected wallet can create a treasury through the DAO and inspect the resulting treasury identity and its administrator.
**Blocked by:** [01.03 — Select and validate the deployment network](../../01-browser-foundation/issues/03-validate-deployment-network.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Establish the DAO deployment and permissionless treasury-creation interaction. The DAO has no administrator; creation deploys a Treasury contract and assigns its caller as that treasury's administrator.
- [ ] Establish the shared TestUSD deployment and public token/deployment interface needed by treasury creation. Its designated currency-minting administrator is separate from treasury administration; the dedicated minting UI belongs to another ticket.
- [ ] Register created treasuries and expose their identity, administrator, and shared funding asset for subsequent proposal and treasury workflows.
- [ ] The application submits creation and distinguishes wallet rejection, submitted transaction, confirmed creation, and failure. Confirmation identifies the actual created treasury, not a guessed address.
- [ ] Supply reproducible local deployment fixtures and public ABI/deployment information through the workspace handoff, without browser imports of private credentials or deployment tooling.
- [ ] Tests use a real local chain to create treasuries from different callers and verify independent administrator assignments and the absence of a DAO-admin restriction.
- [ ] Leave narrowly scoped integration interfaces for membership and proposal payments without implementing arbitrary administrator withdrawals or unrelated domain behavior.

## Scope

A minimal created-treasury confirmation is required. Full discovery, TestUSD minting/funding interactions, and voting NFT administration remain separate tickets.
