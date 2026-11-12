# 03: Resume event scanning from localStorage

**ID:** 06.03
**Spec:** [Feature 06: Recoverable attendance credentials and local scanning](../spec.md)
**What to build:** An organizer reloads the application in the same browser and resumes the correct event's deduplicated attendance collection from localStorage.
**Blocked by:** [06.02 — Scan and validate attendance QR codes](02-scan-attendance-qr.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Persist only accepted hashed entries and necessary local schema/event metadata, scoped by chain ID, DAO address, and proposal ID.
- [ ] Reloading restores the correct set and count; rescanning an existing entry still does not add a duplicate.
- [ ] Changing event or deployment does not mix attendance sets or expose a previous event's collection as the current one.
- [ ] Storage denial, malformed saved data, and write failures are reported honestly; do not label unsaved data as durably saved.
- [ ] Collection remains independent of voting/funding status and requires no application backend or per-scan transaction.
- [ ] Tests cover reload, duplicate-after-reload, multiple events/deployments, malformed local data, and failed storage writes through the application workflow with a controlled storage environment.
- [ ] No names, attendee addresses, signatures, secrets, or pinning credentials are persisted as scan-list content.

## Scope

Assume users do not clear browser data. Do not add attendance import/export, backups, data-loss recovery, cross-device synchronization, or delegated scanner roles.
