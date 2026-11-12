# Issue tracker: Local Markdown

Issues and specs live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- Spec: `.scratch/<feature-slug>/spec.md`.
- Implementation tickets: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`,
  numbered from `01`, one file per ticket.
- Triage state: a `Status:` line near the top of each issue.
  Use the role strings in `triage-labels.md`.
- Append conversation history under `## Comments`.

## Publish and fetch

When publishing, create the appropriate spec or ticket file using
the paths above. Create directories as needed.

When fetching a ticket, read the referenced file. If an issue number
matches multiple features, ask which feature.

## Wayfinding operations

- Map: `.scratch/<effort>/map.md`, with Notes, Decisions-so-far,
  and Fog sections.
- Child tickets: `.scratch/<effort>/issues/NN-<slug>.md`,
  numbered from `01`, with the question in the body.
- Type: a `Type:` line containing `research`, `prototype`,
  `grilling`, or `task`.
- Wayfinding status: `open`, `claimed`, or `resolved`.
  These are workflow states, separate from triage roles.
- Blocking: a `Blocked by: NN, NN` line near the top.
  A ticket is unblocked when all listed tickets are resolved.
- Frontier: scan for open, unblocked, unclaimed tickets;
  lowest number first.
- Claim: set `Status: claimed` and save before working.
- Resolve: append the answer under `## Answer`, set
  `Status: resolved`, then add a gist and link to the map's
  Decisions-so-far section.
