// Proposed attendance-v2 construction ONLY; not a production API.
export const PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n
export type Hash = (domain: bigint, a: bigint, b: bigint) => Promise<bigint>
export const DOMAIN = { recovery: 1n, entry: 2n, leaf: 3n, empty: 4n, context: 5n, root: 6n, count: 7n, node: 16n } as const
export function field(value: string): bigint {
  if (!/^0x[0-9a-f]{64}$/.test(value)) throw new Error('noncanonical field')
  const n = BigInt(value)
  if (n >= PRIME) throw new Error('field out of range')
  return n
}
export const hex = (n: bigint) => {
  if (n < 0n || n >= PRIME) throw new Error('field out of range')
  return `0x${n.toString(16).padStart(64, '0')}`
}
export function limbs(n: bigint): [bigint, bigint] {
  if (n < 0n || n >= 1n << 256n) throw new Error('uint256 out of range')
  return [n >> 128n, n & ((1n << 128n) - 1n)]
}
export async function context(h: Hash, chain: bigint, dao: bigint, proposal: bigint) {
  if (dao < 0n || dao >= 1n << 160n) throw new Error('address out of range')
  let state = 2n
  for (const x of [...limbs(chain), dao, ...limbs(proposal)]) state = await h(DOMAIN.context, state, x)
  return state
}
export async function recover(h: Hash, ctx: bigint, signature: string) {
  if (!/^0x[0-9a-f]{130}$/.test(signature)) throw new Error('65-byte signature required')
  const r = BigInt(`0x${signature.slice(2, 66)}`), s = BigInt(`0x${signature.slice(66, 130)}`)
  const order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
  const v = BigInt(`0x${signature.slice(130)}`)
  if (r === 0n || r >= order || s === 0n || s > order / 2n || (v !== 27n && v !== 28n)) throw new Error('noncanonical ECDSA signature')
  let state = ctx
  for (const x of [...limbs(r), ...limbs(s), v]) state = await h(DOMAIN.recovery, state, x)
  return state
}
export async function tree(h: Hash, ctx: bigint, values: string[]) {
  const entries = [...new Set(values.map(x => hex(field(x))))].sort()
  if (entries.length > 1024) throw new Error('maximum 1024 unique entries')
  const empty = await h(DOMAIN.empty, ctx, 0n)
  const leaves = await Promise.all(entries.map(x => h(DOMAIN.leaf, ctx, field(x))))
  const levels: bigint[][] = [[...leaves, ...Array<bigint>(1024 - leaves.length).fill(empty)]]
  for (let level = 0; level < 10; level++) {
    const row = levels[level], next: bigint[] = []
    for (let i = 0; i < row.length; i += 2) next.push(await h(DOMAIN.node + BigInt(level), row[i], row[i + 1]))
    levels.push(next)
  }
  const count = entries.length
  const root = await h(DOMAIN.root, ctx, await h(DOMAIN.count, BigInt(count), levels[10][0]))
  const path = (index: number) => {
    if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error('index out of range')
    return levels.slice(0, 10).map((row, level) => hex(row[(index >> level) ^ 1]))
  }
  return { entries, count, root: hex(root), path }
}
export async function membership(h: Hash, ctx: bigint, secret: bigint, count: number, index: number, siblings: string[]) {
  if (!Number.isInteger(count) || count < 1 || count > 1024 || !Number.isInteger(index) || index < 0 || index >= count || siblings.length !== 10) throw new Error('invalid path')
  field(hex(secret))
  const entry = await h(DOMAIN.entry, ctx, secret)
  let node = await h(DOMAIN.leaf, ctx, entry)
  for (let i = 0; i < 10; i++) {
    const sibling = field(siblings[i])
    node = (index >> i) & 1 ? await h(DOMAIN.node + BigInt(i), sibling, node) : await h(DOMAIN.node + BigInt(i), node, sibling)
  }
  return hex(await h(DOMAIN.root, ctx, await h(DOMAIN.count, BigInt(count), node)))
}
