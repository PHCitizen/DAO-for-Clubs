import { expect, test } from 'vitest'
import { verifyContentAddress } from './ipfsContent'

const HELLO = new TextEncoder().encode('hello world\n')

// Vectors for the bytes "hello world\n". The CIDv0 is the well-known
// `ipfs add` result; the others were derived with an independent SHA-256 /
// base32 implementation.
const DAG_PB_V0 = 'QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o'
const DAG_PB_V1 = 'bafybeicg2rebjoofv4kbyovkw7af3rpiitvnl6i7ckcywaq6xjcxnc2mby'
const RAW_V1 = 'bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4'

test('bytes are verified against the CID that addresses them', async () => {
  for (const cid of [DAG_PB_V0, DAG_PB_V1, RAW_V1]) {
    expect(await verifyContentAddress(cid, HELLO)).toEqual({ status: 'verified' })
  }
})

test('different bytes do not match the CID', async () => {
  const other = new TextEncoder().encode('hello world!\n')
  for (const cid of [DAG_PB_V0, DAG_PB_V1, RAW_V1]) {
    expect(await verifyContentAddress(cid, other)).toEqual({ status: 'mismatch' })
  }
})

test('identifiers that cannot be verified are reported as unverifiable', async () => {
  expect(await verifyContentAddress('bafyxxxxxxxxxxxxxxxxxxxxxxxx', HELLO)).toEqual({
    status: 'unverifiable',
  })
  expect(await verifyContentAddress('not-a-cid', HELLO)).toEqual({ status: 'unverifiable' })
  // Larger than a single UnixFS chunk: layout depends on the pinning service.
  expect(await verifyContentAddress(DAG_PB_V0, new Uint8Array(300_000))).toEqual({
    status: 'unverifiable',
  })
})
