import { concat, keccak256, type Hex } from 'viem'

/**
 * Sorted-pair keccak256 Merkle tree over 32-byte attendance entries (spec 09
 * POC convention; mirrored on-chain in `AttendanceClaims.sol`).
 *
 * This is NOT the TODO-01-approved canonical cryptographic format: it is a
 * development fixture used to unblock public-claim implementation while
 * feature 07 (attendance publication) and the shared format investigation
 * are still outstanding. See `todos/01-transparent-zk-feasibility.md`.
 *
 * Internal nodes hash their two children in ascending numeric order, so a
 * proof is valid regardless of left/right position. An odd node at any
 * layer is carried forward unchanged rather than hashed with itself, which
 * avoids the classic duplicate-leaf second-preimage weakness of naive
 * duplicate-last-leaf trees.
 */

export class EmptyAttendanceSetError extends Error {
  constructor() { super('An attendance Merkle tree needs at least one entry.') }
}
export class DuplicateAttendanceEntryError extends Error {
  constructor(readonly entry: Hex) { super(`Duplicate attendance entry: ${entry}`) }
}
export class AttendanceEntryNotFoundError extends Error {
  constructor(readonly entry: Hex) { super(`Entry ${entry} is not part of the attendance set.`) }
}

function hashPair(a: Hex, b: Hex): Hex {
  return BigInt(a) < BigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a]))
}

function nextLayer(layer: Hex[]): Hex[] {
  const next: Hex[] = []
  for (let i = 0; i < layer.length; i += 2) {
    next.push(i + 1 < layer.length ? hashPair(layer[i], layer[i + 1]) : layer[i])
  }
  return next
}

function buildLayers(entries: readonly Hex[]): Hex[][] {
  if (entries.length === 0) throw new EmptyAttendanceSetError()
  const seen = new Set<string>()
  for (const entry of entries) {
    const key = entry.toLowerCase()
    if (seen.has(key)) throw new DuplicateAttendanceEntryError(entry)
    seen.add(key)
  }
  const layers: Hex[][] = [[...entries]]
  while (layers[layers.length - 1].length > 1) {
    layers.push(nextLayer(layers[layers.length - 1]))
  }
  return layers
}

/** The finalized attendance root over an organizer's collected entries. */
export function attendanceMerkleRoot(entries: readonly Hex[]): Hex {
  const layers = buildLayers(entries)
  return layers[layers.length - 1][0]
}

/** The sibling path a claimant submits on-chain alongside their disclosed secret. */
export function attendanceMerkleProof(entries: readonly Hex[], target: Hex): Hex[] {
  const layers = buildLayers(entries)
  let index = entries.findIndex(entry => entry.toLowerCase() === target.toLowerCase())
  if (index === -1) throw new AttendanceEntryNotFoundError(target)
  const proof: Hex[] = []
  for (let depth = 0; depth < layers.length - 1; depth++) {
    const layer = layers[depth]
    const siblingIndex = index % 2 === 1 ? index - 1 : index + 1
    if (siblingIndex < layer.length) proof.push(layer[siblingIndex])
    index = Math.floor(index / 2)
  }
  return proof
}

/** Local pre-check mirroring the on-chain verifier, so a bad witness is caught before submission. */
export function verifyAttendanceMerkleProof(leaf: Hex, proof: readonly Hex[], root: Hex): boolean {
  let computed = leaf
  for (const sibling of proof) computed = hashPair(computed, sibling)
  return computed.toLowerCase() === root.toLowerCase()
}
