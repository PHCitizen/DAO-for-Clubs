# 03: Import and verify an off-chain presentation

**ID:** 08.03
**Spec:** [Feature 08: Private off-chain attendance presentations](../spec.md)
**What to build:** A verifier imports a private proof file, authenticates its event root from the blockchain, and verifies attendance off-chain without a wallet or transaction.
**Blocked by:** [07.03 — Finalize the attendance root and reference on-chain](../../07-attendance-publication/issues/03-finalize-attendance.md).
**Status:** ready-for-agent

## Acceptance criteria

- [ ] Import the versioned proof format established by TODO-01 and identify the intended event/deployment without treating file-provided roots as authoritative.
- [ ] Read the finalized root from the configured chain/DAO and verify the real proof against that authenticated statement using application-trusted verifier artifacts.
- [ ] Do not trust a verification key, executable verifier, or alternate deployment supplied by the attendee's file as independent authority.
- [ ] Show valid, invalid, unsupported, or unable-to-complete outcomes as appropriate; RPC failure, missing finalization, and malformed files must never produce successful verification.
- [ ] Require neither a connected wallet nor an on-chain verification transaction. Explain that this is off-chain, not guaranteed disconnected verification.
- [ ] Communicate organizer trust and credential transferability; a valid proof is not personal identity, funding approval, payout evidence, or independent physical-presence verification.
- [ ] Test real positive/negative proof fixtures from TODO-01, altered bytes, changed root/event/deployment, unsupported formats, untrusted verifier metadata, missing finalization, and network failure through the import workflow.

## Scope

This can proceed independently of the proof-generation and dataset-reader UIs using the canonical real benchmark artifacts. It inherits the deferred TODO-01 gate and may not replace verification with mocked success or a signature-only check.
