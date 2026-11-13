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
/** Default UnixFS chunk size (256 KiB); larger files become multi-block DAGs. */
export const MAX_SINGLE_CHUNK_BYTES = 262_144
const CIDV1_VERSION = 1
const SHA2_256_DIGEST_BYTES = 32
/** CIDv0 is a bare 34-byte multihash: 0x12 0x20 + 32-byte digest. */
const CIDV0_MULTIHASH_BYTES = 34
/** CIDv1 binary: version, codec, 0x12, 0x20, 32-byte digest (single-byte codec). */
const CIDV1_BINARY_BYTES = 36
/** Multibase prefix 'b' marks base32 lowercase, the default CIDv1 text form. */

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
    if (!multihash || multihash.length !== CIDV0_MULTIHASH_BYTES || multihash[0] !== SHA2_256 || multihash[1] !== SHA2_256_DIGEST_BYTES) {
      return null
    }
    return { codec: CODEC_DAG_PB, digest: multihash.slice(2) }
  }
  if (/^b[a-z2-7]+$/.test(cid)) {
    const bytes = decodeBase32(cid.slice(1))
    if (!bytes || bytes.length !== CIDV1_BINARY_BYTES || bytes[0] !== CIDV1_VERSION) return null
    if (bytes[2] !== SHA2_256 || bytes[3] !== SHA2_256_DIGEST_BYTES) return null
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

// Protobuf field tags (field number << 3 | wire type) used by dag-pb/UnixFS.
const PB_UNIXFS_TYPE_TAG = 0x08 // UnixFS Data.Type, varint
const PB_UNIXFS_TYPE_FILE = 0x02 // Type = File
const PB_UNIXFS_DATA_TAG = 0x12 // UnixFS Data.Data, length-delimited
const PB_UNIXFS_FILESIZE_TAG = 0x18 // UnixFS Data.filesize, varint
const PB_NODE_DATA_TAG = 0x0a // dag-pb PBNode.Data, length-delimited

/** dag-pb node holding a single-chunk UnixFS file (Type=File, Data, filesize). */
function encodeUnixFsFileNode(bytes: Uint8Array): Uint8Array {
  const unixfs = concat(
    [PB_UNIXFS_TYPE_TAG, PB_UNIXFS_TYPE_FILE, PB_UNIXFS_DATA_TAG],
    varint(bytes.length),
    bytes,
    [PB_UNIXFS_FILESIZE_TAG],
    varint(bytes.length)
  )
  return concat([PB_NODE_DATA_TAG], varint(unixfs.length), unixfs)
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
