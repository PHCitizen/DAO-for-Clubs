# Feature 04: Public voting and recorded passing

Status: ready-for-agent

## Problem Statement

Members need to publicly support or oppose a published event proposal using their treasury's voting NFTs. The result must remain precise when administrators mint or burn credentials, and vote close must not be confused with losing a passed proposal's right to funding.

## Solution

Allow each eligible treasury voting NFT one public, unchangeable yes/no vote. Evaluate the threshold against current supply, record passing while voting is open, and allow an explicit passing check when membership changes make existing votes sufficient.

## User Stories

1. As a voter, I want to inspect the published proposal before voting, so that I can understand the funding request.
2. As a voting NFT holder, I want to vote yes, so that I can support allocating funds.
3. As a voting NFT holder, I want to vote no, so that my opposition is publicly recorded.
4. As a voter, I want each token accepted only once per proposal, so that duplicate submissions cannot inflate the result.
5. As a holder of multiple NFTs, I want each credential to have its own vote, so that token-based voting weight is respected.
6. As a newly minted NFT holder, I want to vote on an already open proposal, so that current membership can participate.
7. As a participant, I want existing votes retained after an NFT is burned, so that historical ballots are not rewritten.
8. As a participant, I want the current threshold displayed, so that I understand how many yes votes are required.
9. As a participant, I want passing recorded immediately when a vote meets the threshold, so that later membership changes cannot undo it.
10. As a participant, I want anyone to trigger a passing check after burns, so that an additional ballot is not required when existing votes become sufficient.
11. As a visitor, I want to inspect public ballots and totals, so that I can follow the organization's decision.
12. As a voter, I want voting blocked after passing or the deadline, so that closed results cannot be changed.
13. As a visitor, I want open, passed, and closed-without-passing outcomes distinguished, so that a transient threshold is not mistaken for a recorded result.
14. As a participant, I want administrator control over live supply disclosed, so that I understand the trust model.
15. As an organizer, I want passing independent of treasury balance, so that a temporary shortage does not erase the vote's result.
16. As a visitor, I want voting distinguished from attendance and payment, so that I do not infer either from a public ballot.

## Implementation Decisions

- Consume the proposal identity, treasury, creator, immutable terms, published-document reference, and voting deadline established by the proposal feature. Do not duplicate proposal creation or Markdown/IPFS authoring here.
- Public yes/no votes require ownership of a voting NFT belonging to the proposal's treasury. Consume its token ID for the proposal regardless of choice; a ballot cannot be changed.
- The yes threshold is the integer floor of half the current treasury voting NFT supply, plus one. No count, holder, or token-set snapshot is taken.
- Newly minted tokens can vote on already open proposals. Burning changes current supply but neither removes previously cast votes nor permits consumed token IDs to vote again.
- A vote evaluates the current threshold and records passing when satisfied. Passing immediately closes voting and later supply changes cannot undo it.
- Expose the permissionless passing-check action, referred to as passed, to record the same result without a new ballot. Require an open vote and sufficient recorded yes votes under current supply.
- Use chain time. At or after the deadline, reject new ballots and first passing records. Reads can derive closed-without-passing status without a timer transaction.
- If no transaction recorded passing before vote close, the proposal did not pass, even if a threshold was temporarily met earlier. Do not infer historical NFT supply after the deadline.
- With zero current NFTs the threshold is one. Existing retained yes votes may still qualify after burns; a never-voted proposal needs a subsequently minted NFT to cast a yes vote.
- Provide public ballot, total, threshold, consumption, and outcome reads for the application. Display voting progress separately from document retrieval errors, payments, and attendance state.
- Keep the passing rule reusable by fund release rather than implementing inconsistent checks in separate workflows. Passing does not require or reserve treasury funds.

## Testing Decisions

- Test yes/no voting, totals, public ballot inspection, automatic passing, and explicit checks through the application action/read interface on a real local chain.
- Direct external contract calls test wrong owners, wrong treasuries, duplicate ballots across choices, burned-token voting attempts, and all deadline guards.
- Cover odd/even/zero supply, NFTs minted after proposal creation, multiple NFTs held by one wallet, retained votes after burning, and changing thresholds.
- Include six NFTs, three yes votes, and two later burns: an explicit check before vote close records passing with three yes votes.
- Verify exact deadline behavior, early close on passing, no passing recorded after close, and irreversibility after later minting or burning.
- Assert observable authorization, ballots, and outcomes rather than private bookkeeping. Reuse the foundation, proposal, and membership fixtures; there is no prior voting implementation.

## Out of Scope

- Markdown authoring, proposal-document upload, proposal creation or amendment, and attendance publication.
- Anonymous or changeable votes, delegation, participation-only quorum, membership snapshots, and weighting other than one vote per NFT.
- Automatic scheduled contract execution, payout execution, expense verification, or undoing passing after membership changes.

## Further Notes

This feature waits for the minimal proposal-creation interface and NFT issuance, not the entire proposal-reading UI. Fund-release work can begin once recorded passing exists. Public voting's wallet associations are accepted and do not imply attendance.
