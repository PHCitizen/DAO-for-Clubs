# Domain Docs

This repo uses a multi-context layout:
- Root `GLOSSARY-MAP.md` maps domain contexts to their glossaries.
- Each context has a `GLOSSARY.md`, conventionally at `src/<context>/GLOSSARY.md`.
  Use the paths recorded in the map when contexts live elsewhere.
- System-wide architecture decision records live in `docs/adr/`.
- Context-specific ADRs live in `src/<context>/docs/adr/`, or the
  context's equivalent directory recorded in the map.

## Before exploring

Read `GLOSSARY-MAP.md` first, then each glossary relevant to the topic.
For work spanning contexts, read the glossaries for all affected contexts.
Read relevant system-wide ADRs and the affected contexts' ADRs.

If these files do not exist, proceed silently. Domain modeling
creates them lazily as terms and decisions are resolved.

## Use domain vocabulary

Use the relevant context's glossary terms in issue titles, proposals,
hypotheses, and test names, respecting explicitly avoided synonyms.
When a term has different meanings across contexts, qualify it with
its context rather than treating the meanings as interchangeable.

If a needed concept is missing, reconsider whether it belongs
to the domain or note the gap for domain modeling.

## Flag ADR conflicts

Explicitly surface any proposal that contradicts an existing ADR,
identifying the ADR and explaining why it may warrant reopening.
