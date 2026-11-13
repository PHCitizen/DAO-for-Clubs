# Organizer attendance scanning (spec 06.02)

Implementation: `packages/frontend/src/attendanceScan.ts` (validation, dedupe,
collection), `application.ts` (`startAttendanceScan`), `browserCamera.ts` (real
camera transport), UI in `routes/proposals/-attendance.tsx`.

Scope: in-session collection only. Persistence across reload is the next ticket.
The collection retains hashed entries and event context (chain ID, DAO address,
proposal ID) only. Payloads with any field beyond `v, chainId, dao, proposalId,
entry` are rejected whole (a secret or signature must never be silently trimmed).

## Real camera smoke check (manual)

Automated tests replace the camera transport with controlled payloads. The real
camera path (`getUserMedia` + `BarcodeDetector`, Chromium-based browsers; the
page needs HTTPS or localhost) is checked by hand:

1. Run the app with a deployment configured; connect the wallet that created a
   proposal.
2. On a second device, connect an attendee wallet and prepare the attendance QR
   for that proposal (spec 06.01).
3. On the proposal page choose "Start camera", allow permission, and show the QR.
   Expect "Entry accepted" and count 1; showing it again expects "Already
   scanned" with count still 1.
4. Show a QR for another proposal: expect rejection, count unchanged.
5. Reload, deny the permission, start again: expect the permission message.
   Browsers without BarcodeDetector (Firefox) should report no usable camera.

Status: NOT executed. No real camera was available to the implementing agent.
