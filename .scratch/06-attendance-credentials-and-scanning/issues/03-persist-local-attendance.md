# 03: Resume event scanning from localStorage

**ID:** 06.03
**Spec:** [Feature 06: Recoverable attendance credentials and local scanning](../spec.md)
**What to build:** An organizer reloads the application in the same browser and resumes the correct event's deduplicated attendance collection from localStorage.
**Blocked by:** [06.02 — Scan and validate attendance QR codes](02-scan-attendance-qr.md).
**Status:** implemented; manual reload check in a real browser pending

## Acceptance criteria

- [x] Persist only accepted hashed entries and necessary local schema/event metadata, scoped by chain ID, DAO address, and proposal ID.
- [x] Reloading restores the correct set and count; rescanning an existing entry still does not add a duplicate.
- [x] Changing event or deployment does not mix attendance sets or expose a previous event's collection as the current one.
- [x] Storage denial, malformed saved data, and write failures are reported honestly; do not label unsaved data as durably saved.
- [x] Collection remains independent of voting/funding status and requires no application backend or per-scan transaction.
- [x] Tests cover reload, duplicate-after-reload, multiple events/deployments, malformed local data, and failed storage writes through the application workflow with a controlled storage environment.
- [x] No names, attendee addresses, signatures, secrets, or pinning credentials are persisted as scan-list content.

## Comments

- Implemented in `attendanceStorage.ts` (versioned key per chain ID, DAO address, proposal ID; saves only `schema`, event identity, and hashed entries). The collection loads on first scan start and saves on each accepted entry. Accepted `ScanResult` carries `saved`; the collection view carries `storage` (`saved`, `save-failed`, `unavailable`, `corrupt`) so unsaved data is never labelled saved.
- Malformed or mismatched saved data is not restored and is reported as `corrupt`; the next accepted entry replaces it.
- Tests (`attendance-scan.test.ts`) use a controlled storage fake through the application workflow. No real browser reload was performed.
- The repo has no "done" triage role, so status follows ticket 06.02's precedent.

## Scope

Assume users do not clear browser data. Do not add attendance import/export, backups, data-loss recovery, cross-device synchronization, or delegated scanner roles.
