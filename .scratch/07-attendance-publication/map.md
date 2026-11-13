# Attendance publication map

## Notes

- Scope and dependency graph: [spec](spec.md), [07.01](issues/01-prepare-attendance-set.md).
- Integration branch: `integration/task-07-01`.
- Format authority: [approved agreement](../../docs/attendance-format-v2-proposal.md).

## Decisions-so-far

- [07.01 implementation/evidence](issues/01-prepare-attendance-set.md#answer):
  canonical saved-scan preparation through public action/read APIs; pinned Noir
  arithmetic adapter; exact immutable bytes/root preview with stale-input rejection.
- `createProposal` retains v1; `createProposalV2` fixes v2 at creation. New
  application-created events use v2. No version setter, migration, finalization,
  proof upgrade or consumption namespace is introduced.
- Downstream code should use the prepared snapshot, not live collections. Contract
  claims must remain keyed by event + derived entry, never proof-artifact version.

## Fog

- Pinning/finalization and authenticated retrieval belong to subsequent tickets.
- Real-wallet recovery and physical-camera reload checks remain manual; existing
  private-proof qualification gates are unchanged. Older deployed DAOs without
  `attendanceVersion` are not silently inferred or migrated by the new application.
