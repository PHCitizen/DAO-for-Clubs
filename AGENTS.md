## Engineering approach

- **Strategy first:** before implementation, read the relevant spec and existing code, identify invariants and dependencies, and explain the design, trade-offs, and long-term maintenance impact.
- **Tactical execution:** plan small, verifiable slices with explicit interfaces and ownership. Establish shared interfaces before parallel work and keep each change focused on its intended behavior.
- **Long-term care:** favor cohesive modules, clear naming, minimal coupling, and reproducible tooling. Preserve the project's architecture rather than adding one-off workarounds to finish a task.
- **Evidence over brute force:** investigate root causes and test explicit hypotheses. Avoid speculative changes, repeated trial-and-error patches, disabled checks, or weakened requirements just to make something run.
- **Finish deliberately:** verify behavior at the highest practical testing seam, review integration effects, and report remaining risks or blockers. Raise an architectural conflict before expanding scope or compromising an agreed requirement.

## Tooling

Use pnpm and a pnpm workspace. Separate the frontend package from the contracts/tooling package, which owns Solidity, Hardhat, contract tests, and deployment/maintenance scripts. Keep development credentials and deployment-only code out of the frontend.

### Contracts tooling and scripts

Write contracts-package configuration, tests, deployment/maintenance tooling, and other repository scripts in TypeScript. Run standalone scripts with `tsx`; on-chain contracts remain Solidity. Keep scripts straightforward, organized into small named functions with a clear `main` flow. Script-specific automated tests are not required; verify scripts through TypeScript checks and a direct run when safe. Keep behavioral tests for application and contract behavior.

## Agent skills

### Issue tracker

Issues and specs live in `.scratch/<feature>/` as Markdown. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage roles. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context: root `GLOSSARY-MAP.md`, per-context glossaries and ADRs, and system-wide `docs/adr/`. Before exploring domain concepts or architecture, read `docs/agents/domain.md`.
