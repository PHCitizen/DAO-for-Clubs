// ---------------------------------------------------------------------------
// Content-address verification
// ---------------------------------------------------------------------------
//
// A gateway is not trusted: bytes retrieved for a CID are re-hashed and
// compared with the digest the CID commits to. Supported identifiers use a
// SHA-256 multihash with either the `raw` codec (digest of the bytes) or the
// `dag-pb` codec (digest of the single-block UnixFS file node, which is how
// pinning services store files up to one 256 KiB chunk).

export type ContentAddressVerification =
  | { status: 'verified' }
  | { status: 'mismatch' }
  /** The CID uses a codec/hash/layout this client cannot recompute. */
  | { status: 'unverifiable' }

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
const SHA2_256 = 0x12
const CODEC_RAW = 0x55
const CODEC_DAG_PB = 0x70
const MAX_SINGLE_CHUNK_BYTES = 262_144

interface ParsedCid {
  codec: number
  digest: Uint8Array
}

function decodeBase58(value: string): Uint8Array | null {
  let number = 0n
  for (const char of value) {
    const index = BASE58_ALPHABET.indexOf(char)
    if (index < 0) return null
    number = number * 58n + BigInt(index)
  }
  const bytes: number[] = []
  while (number > 0n) {
    bytes.unshift(Number(number & 0xffn))
    number >>= 8n
  }
  const leadingZeros = value.length - value.replace(/^1+/, '').length
  return Uint8Array.from([...new Array<number>(leadingZeros).fill(0), ...bytes])
}

function decodeBase32(value: string): Uint8Array | null {
  const bytes: number[] = []
  let bits = 0
  let buffer = 0
  for (const char of value) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index < 0) return null
    buffer = ((buffer << 5) | index) & 0xffff
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return Uint8Array.from(bytes)
}

function parseCid(cid: string): ParsedCid | null {
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)) {
    const multihash = decodeBase58(cid)
    if (!multihash || multihash.length !== 34 || multihash[0] !== SHA2_256 || multihash[1] !== 32) {
      return null
    }
    return { codec: CODEC_DAG_PB, digest: multihash.slice(2) }
  }
  if (/^b[a-z2-7]+$/.test(cid)) {
    const bytes = decodeBase32(cid.slice(1))
    // version 1, single-byte codec, sha2-256 multihash of 32 bytes
    if (!bytes || bytes.length !== 36 || bytes[0] !== 1) return null
    if (bytes[2] !== SHA2_256 || bytes[3] !== 32) return null
    return { codec: bytes[1]!, digest: bytes.slice(4) }
  }
  return null
}

function varint(value: number): number[] {
  const out: number[] = []
  let rest = value
  while (rest >= 0x80) {
    out.push((rest & 0x7f) | 0x80)
    rest = Math.floor(rest / 128)
  }
  out.push(rest)
  return out
}

function concat(...parts: ArrayLike<number>[]): Uint8Array {
  return Uint8Array.from(parts.flatMap((part) => Array.from(part)))
}

/** dag-pb node holding a single-chunk UnixFS file (Type=File, Data, filesize). */
function encodeUnixFsFileNode(bytes: Uint8Array): Uint8Array {
  const unixfs = concat([0x08, 0x02, 0x12], varint(bytes.length), bytes, [0x18], varint(bytes.length))
  return concat([0x0a], varint(unixfs.length), unixfs)
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export async function verifyContentAddress(
  cid: string,
  bytes: Uint8Array
): Promise<ContentAddressVerification> {
  const parsed = parseCid(cid)
  if (!parsed) return { status: 'unverifiable' }

  let addressed: Uint8Array
  if (parsed.codec === CODEC_RAW) {
    addressed = bytes
  } else if (parsed.codec === CODEC_DAG_PB) {
    if (bytes.length > MAX_SINGLE_CHUNK_BYTES) return { status: 'unverifiable' }
    addressed = encodeUnixFsFileNode(bytes)
  } else {
    return { status: 'unverifiable' }
  }

  return equalBytes(await sha256(addressed), parsed.digest)
    ? { status: 'verified' }
    : { status: 'mismatch' }
}
