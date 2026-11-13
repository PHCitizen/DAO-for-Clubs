import { describe, expect, test } from 'vitest'
import type { Hex } from 'viem'
import {
  AttendanceEntryNotFoundError,
  attendanceMerkleProof,
  attendanceMerkleRoot,
  DuplicateAttendanceEntryError,
  EmptyAttendanceSetError,
  verifyAttendanceMerkleProof,
} from './attendanceMerkle'

const leaf = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}` as Hex

describe('attendance Merkle tree (spec 09 POC convention)', () => {
  test('a single-entry set roots to that entry with an empty proof', () => {
    const entries = [leaf(1)]
    expect(attendanceMerkleRoot(entries)).toBe(leaf(1))
    const proof = attendanceMerkleProof(entries, leaf(1))
    expect(proof).toEqual([])
    expect(verifyAttendanceMerkleProof(leaf(1), proof, attendanceMerkleRoot(entries))).toBe(true)
  })

  test('every leaf in a balanced set produces a proof that verifies against the root', () => {
    const entries = [leaf(1), leaf(2), leaf(3), leaf(4)]
    const root = attendanceMerkleRoot(entries)
    for (const entry of entries) {
      const proof = attendanceMerkleProof(entries, entry)
      expect(verifyAttendanceMerkleProof(entry, proof, root)).toBe(true)
    }
  })

  test('an odd-sized set carries the lone node forward instead of self-hashing it', () => {
    const entries = [leaf(1), leaf(2), leaf(3)]
    const root = attendanceMerkleRoot(entries)
    for (const entry of entries) {
      expect(verifyAttendanceMerkleProof(entry, attendanceMerkleProof(entries, entry), root)).toBe(true)
    }
    // The lone leaf 3's proof is exactly its one sibling root: pairing [1,2], then [root(1,2), 3].
    expect(attendanceMerkleProof(entries, leaf(3))).toEqual([attendanceMerkleRoot([leaf(1), leaf(2)])])
  })

  test('is order-independent for pair hashing but entry order still changes the tree shape/root', () => {
    const a = attendanceMerkleRoot([leaf(1), leaf(2)])
    const b = attendanceMerkleRoot([leaf(2), leaf(1)])
    expect(a).toBe(b) // sorted-pair hashing makes this pair's internal node order-independent.
    const c = attendanceMerkleRoot([leaf(1), leaf(2), leaf(3)])
    const d = attendanceMerkleRoot([leaf(3), leaf(2), leaf(1)])
    expect(c).not.toBe(d) // but which leaves pair together still depends on position.
  })

  test('a wrong proof, wrong leaf, or wrong root fails verification', () => {
    const entries = [leaf(1), leaf(2), leaf(3), leaf(4)]
    const root = attendanceMerkleRoot(entries)
    const proof = attendanceMerkleProof(entries, leaf(1))
    expect(verifyAttendanceMerkleProof(leaf(2), proof, root)).toBe(false)
    expect(verifyAttendanceMerkleProof(leaf(1), proof, leaf(99))).toBe(false)
    expect(verifyAttendanceMerkleProof(leaf(1), [leaf(99)], root)).toBe(false)
  })

  test('rejects an empty set, duplicate entries, and a target outside the set', () => {
    expect(() => attendanceMerkleRoot([])).toThrow(EmptyAttendanceSetError)
    expect(() => attendanceMerkleRoot([leaf(1), leaf(1)])).toThrow(DuplicateAttendanceEntryError)
    expect(() => attendanceMerkleProof([leaf(1), leaf(2)], leaf(3))).toThrow(AttendanceEntryNotFoundError)
  })

  test('entry comparison is case-insensitive', () => {
    const upper = `0x${'A'.repeat(64)}` as Hex
    const lower = `0x${'a'.repeat(64)}` as Hex
    expect(() => attendanceMerkleRoot([upper, lower])).toThrow(DuplicateAttendanceEntryError)
  })
})
