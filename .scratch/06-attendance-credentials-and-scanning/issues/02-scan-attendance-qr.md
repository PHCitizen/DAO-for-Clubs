# 02: Scan and validate attendance QR codes

**ID:** 06.02
**Spec:** [Feature 06: Recoverable attendance credentials and local scanning](../spec.md)
**What to build:** The organizer scans attendees' QR codes into a validated, deduplicated event attendance set without a blockchain transaction per scan.
**Blocked by:** [06.01 — Generate and recover an event attendance QR](01-recover-attendance-qr.md).
**Status:** implemented; real-camera smoke check pending

## Acceptance criteria

- [x] Provide the proposal creator's organizer workflow for camera scanning, showing the selected deployment/event and accepted-entry count.
- [x] Validate QR schema, entry encoding, chain ID, DAO address, and proposal ID before accepting an entry.
- [x] Reject wrong-event/deployment, malformed, or secret-bearing unexpected payloads rather than silently adding them as valid entries.
- [x] Deduplicate identical hashed entries in the active session; repeat scans give feedback without increasing count.
- [x] Store only the accepted hashed entries and necessary event context in the collection model, not attendee names, wallet addresses, signatures, or secrets.
- [x] Scanning needs no attendee NFT, successful vote, payout, or per-scan chain transaction. Camera permission errors and malformed input do not corrupt the accepted set.
- [x] Behavioral tests use controlled camera payloads for accepted/duplicate/malformed/mismatched scans and camera failure; document a real camera smoke check. (Smoke check documented in docs/attendance-scanning.md but NOT yet executed on a real camera.)

## Notes

- The finalized-event rule (refusing scans once the event is finalized) is deferred; it is not implemented here.
- Real-camera smoke check (docs/attendance-scanning.md) is still pending and has not been run on a real device.
- Repeated detections of the same payload within a short window are one scan (session layer); dedupe of entries stays in the collection.

## Scope

This delivers in-session collection. Persistence/reload is next. Do not introduce delegated scanners, synchronization, personal identity guarantees, or a Merkle format before feasibility work.
