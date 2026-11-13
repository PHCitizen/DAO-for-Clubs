import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, test } from 'vitest'
import {
  ATTENDANCE_MESSAGE_LABEL,
  attendanceSigningMessage,
  InvalidAttendanceSignatureError,
  deriveAttendanceCredential,
  encodeAttendanceQr,
  isAttendanceProposalId,
} from './attendance'

/**
 * Frozen vectors. Every expected value below was computed outside the
 * implementation (Node crypto over hand-assembled ABI bytes) so these tests
 * disagree with the code if serialization or hashing drifts.
 *
 * Signature: personal_sign (EIP-191) by the well-known Hardhat account #0
 * (secp256k1 RFC 6979 signing is deterministic), 65 bytes r||s||v.
 */
const DAO_LOWERCASE = '0x5fbdb2315678afecb367f032d93f642f64180aa3'
const VECTOR = {
  chainId: 31337,
  daoAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as const,
  proposalId: 1n,
  message:
    'DAO for Clubs attendance v1\nChain ID: 31337\nDAO: 0x5FbDB2315678afecb367f032d93F642f64180aa3\nProposal ID: 1',
  signature:
    '0xd3cdda5f225fa4b153a6c6a5b47173b568300633d82a6ff334c64d277c9a7cf25d8169f020e7f3550850d16c8ea588032d23ddd33e6f4caa7e0c3c834523037b1b' as const,
  // Intermediate secret (not exported by the module): kept to document the vector.
  secret: '0xaa66bdf12269f5ac9e972bb035ff03ad5a01398a8886a047fe33b71df9feae02' as const,
  entry: '0x875e44e768dec6589cfd78200bf53ff8d24e9fa1359a676f582b24da8834130e' as const,
}

describe('attendance signing message', () => {
  test('is the exact frozen versioned serialization with a checksummed DAO address', () => {
    expect(ATTENDANCE_MESSAGE_LABEL).toBe('DAO for Clubs attendance v1')
    expect(
      attendanceSigningMessage({
        chainId: VECTOR.chainId,
        daoAddress: VECTOR.daoAddress,
        proposalId: VECTOR.proposalId,
      })
    ).toBe(VECTOR.message)
  })

  test('canonicalizes the DAO address so casing cannot change the message', () => {
    expect(
      attendanceSigningMessage({
        chainId: VECTOR.chainId,
        daoAddress: DAO_LOWERCASE,
        proposalId: VECTOR.proposalId,
      })
    ).toBe(VECTOR.message)
  })

  test('separates chain, deployment, and proposal', () => {
    const base = { chainId: 31337, daoAddress: VECTOR.daoAddress, proposalId: 1n }
    const messages = new Set([
      attendanceSigningMessage(base),
      attendanceSigningMessage({ ...base, chainId: 97 }),
      attendanceSigningMessage({ ...base, proposalId: 2n }),
      attendanceSigningMessage({
        ...base,
        daoAddress: '0x00000000000000000000000000000000000000d1',
      }),
    ])
    expect(messages.size).toBe(4)
  })
})

describe('attendance credential derivation', () => {
  test('signs the frozen message bytes to the frozen signature and entry vector', async () => {
    // Hardhat account #0, EIP-191 over the exact message bytes.
    const signer = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
    expect(await signer.signMessage({ message: VECTOR.message })).toBe(VECTOR.signature)
    expect(deriveAttendanceCredential(VECTOR.signature, VECTOR.proposalId)).toEqual({ entry: VECTOR.entry })
  })

  test('is stable for the same signature and differs for another signer or proposal', async () => {
    // Hardhat account #1 signing the same message gives a genuinely different signature.
    const other = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
    const otherSignature = await other.signMessage({ message: VECTOR.message })
    expect(otherSignature).not.toBe(VECTOR.signature)
    const same = deriveAttendanceCredential(VECTOR.signature, VECTOR.proposalId).entry
    expect(deriveAttendanceCredential(VECTOR.signature, VECTOR.proposalId).entry).toBe(same)
    expect(deriveAttendanceCredential(otherSignature, VECTOR.proposalId).entry).not.toBe(same)
    expect(deriveAttendanceCredential(VECTOR.signature, 2n).entry).not.toBe(same)
  })

  test('does not expose the secret and rejects malformed signatures', () => {
    expect(JSON.stringify(deriveAttendanceCredential(VECTOR.signature, 1n))).not.toContain(VECTOR.secret.slice(2))
    expect(() => deriveAttendanceCredential('0x1234', 1n)).toThrow(InvalidAttendanceSignatureError)
  })

  test('accepts only uint256 proposal IDs', () => {
    expect(isAttendanceProposalId(0n)).toBe(true)
    expect(isAttendanceProposalId(2n ** 256n - 1n)).toBe(true)
    expect(isAttendanceProposalId(-1n)).toBe(false)
    expect(isAttendanceProposalId(2n ** 256n)).toBe(false)
  })
})

describe('attendance QR payload', () => {
  test('carries only chain ID, DAO address, proposal ID, and the entry', () => {
    const qr = encodeAttendanceQr({
      chainId: VECTOR.chainId,
      daoAddress: DAO_LOWERCASE,
      proposalId: VECTOR.proposalId,
      entry: VECTOR.entry,
    })
    expect(JSON.parse(qr)).toEqual({
      v: 1,
      chainId: 31337,
      dao: VECTOR.daoAddress,
      proposalId: '1',
      entry: VECTOR.entry,
    })
    expect(qr).not.toContain(VECTOR.secret.slice(2))
    expect(qr).not.toContain(VECTOR.signature.slice(2))
  })
})
