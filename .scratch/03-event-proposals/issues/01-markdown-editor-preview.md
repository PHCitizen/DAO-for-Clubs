# 01: Write and safely preview a Markdown proposal

**ID:** 03.01
**Spec:** [Feature 03: Proposal authoring and IPFS publication](../spec.md)
**What to build:** An organizer can compose and revise a Markdown proposal and inspect a safe preview before publishing anything.
**Blocked by:** [01.01 — Scaffold and run the pnpm workspace](../../01-browser-foundation/issues/01-scaffold-pnpm-workspace.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Provide a Markdown editing workflow with a preview suitable for explaining an event and funding request.
- [ ] Draft changes update the preview and remain editable before publication; authoring requires neither wallet connection nor a blockchain transaction.
- [ ] Establish the small versioned proposal-document format and exact encoding consumed by the publication ticket, keeping content separate from pinning credentials and later attendance data.
- [ ] Preview rendering safely handles untrusted Markdown: script-bearing content and unsafe URL schemes cannot execute application code. Make this rendering policy reusable by published-document reading.
- [ ] Behavioral tests cover meaningful Markdown formatting, draft revisions, malicious HTML, and unsafe links through the editor/preview workflow.
- [ ] Do not introduce collaborative editing, post-publication amendments, a full rich-text document system, or an application backend.

## Scope

This ticket ends with a reviewed draft and its defined document representation. IPFS upload and on-chain creation are separate workflows. Persistent draft backup is not required.
