import { expect, test, vi } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import type { Address, Hex } from 'viem'
import { createApplication } from './application'
import type { WalletAdapter } from './wallet'
import type { RpcAdapter } from './rpc'
import type { AttendanceStorage } from './attendanceStorage'
import { encodeAttendanceQr } from './attendance'
import { encodeAttendanceV2Qr, ATTENDANCE_FIELD } from './attendanceV2'
import vectors from '../../contracts/scripts/attendance-v2/vectors.json'

const DAO = '0x1234567890abcdef1234567890abcdef12345678' as const
const TOKEN = '0x00000000000000000000000000000000000000aa' as const
// Exact visibly public TODO-01 fixture key; never a user credential.
const SIGNER = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const hex = (n: bigint): Hex => `0x${n.toString(16).padStart(64, '0')}`

function setup(options: { version?: number; chainId?: number; dao?: Address; proposalId?: bigint; storage?: AttendanceStorage; signer?: (message: string) => Promise<Hex>; organizer?: Address; account?: Address } = {}) {
  const chainId = options.chainId ?? 97
  const daoAddress = options.dao ?? DAO
  const proposalId = options.proposalId ?? 42n
  const event = { chainId, daoAddress, proposalId, credentialVersion: 2 as const }
  const data = new Map<string, string>()
  const storage: AttendanceStorage = options.storage ?? { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) } }
  let emit: (payload: string) => void = () => {}
  let accountChanged: (event: { account: Address | null }) => void = () => {}
  let chainChanged: (event: { chainId: number }) => void = () => {}
  const signMessage = vi.fn((_account: Address, message: string) => options.signer ? options.signer(message) : SIGNER.signMessage({ message }))
  const wallet = {
    isAvailable: () => true, connect: async () => options.account ?? SIGNER.address, disconnect: async () => {},
    getAccount: async () => options.account ?? SIGNER.address, getChainId: async () => chainId,
    onAccountChanged: (listener: typeof accountChanged) => { accountChanged = listener; return () => {} },
    onChainChanged: (listener: typeof chainChanged) => { chainChanged = listener; return () => {} },
    switchChain: async () => {}, sendTransaction: vi.fn(), signMessage,
  } as unknown as WalletAdapter
  const rpc = { getChainId: async () => chainId, readContract: async ({ functionName }: { functionName: string }) => {
    if (functionName === 'attendanceVersion') return options.version ?? 2
    if (functionName === 'proposalCount') return (1n << 256n) - 1n
    if (functionName === 'getProposal') return { id: proposalId, treasury: TOKEN, creator: options.organizer ?? SIGNER.address, amount: 1n, payoutRecipient: SIGNER.address, votingDeadline: 1n, documentReference: 'ipfs://fixture' }
    throw new Error(`Unexpected read ${functionName}`)
  } } as unknown as RpcAdapter
  const app = createApplication(wallet, rpc, { chainId, daoAddress, testUsdAddress: TOKEN }, { attendanceStorage: storage, camera: { start: async handler => { emit = handler; return { stop() {} } } } })
  return { app, event, data, storage, signMessage, changeAccount: (account: Address) => accountChanged({ account }), changeChain: (chainId: number) => chainChanged({ chainId }), scan: (entry: Hex) => emit(encodeAttendanceV2Qr(event, entry)), payload: (payload: string) => emit(payload) }
}

async function start(options: Parameters<typeof setup>[0] = {}) {
  const env = setup(options)
  await env.app.connect()
  const result = await env.app.startAttendanceScan({ proposalId: env.event.proposalId })
  if (result.status !== 'scanning') throw new Error(result.message)
  return { ...env, session: result.session }
}

test('real deterministic EOA recovery matches the approved Solidity/Noir entry and produces a collectable v2 QR', async () => {
  const env = await start()
  const credential = await env.app.prepareAttendanceCredential({ proposalId: 42n })
  expect(credential.status).toBe('ready')
  if (credential.status !== 'ready') return
  expect(env.signMessage).toHaveBeenCalledWith(SIGNER.address, vectors.message)
  expect(credential.entry).toBe(vectors.entry)
  expect(credential.qr).toBe(`{"schema":"attendance-qr/v2","chainId":"97","dao":"${DAO}","proposalId":"42","entry":"${vectors.entry}"}`)
  env.payload(credential.qr)
  const prepared = await env.app.prepareAttendanceSet({ proposalId: 42n })
  expect(prepared.status).toBe('prepared')
  if (prepared.status !== 'prepared') return
  expect(prepared.set.root).toBe(vectors.sets[1].root)
  expect(prepared.set.count).toBe(1)
  expect(prepared.set.bytes).toBe(`{"schema":"attendance-set/v2","chainId":"97","dao":"${DAO}","proposalId":"42","entries":["${vectors.entry}"]}`)
  expect(Object.isFrozen(prepared.set)).toBe(true)
  expect(Object.isFrozen(prepared.set.entries)).toBe(true)
  expect(prepared.set.warning).toMatch(/immutable.*Later attendees/)
  const output = JSON.stringify(prepared)
  for (const forbidden of [vectors.signature, vectors.secret, SIGNER.address.toLowerCase(), 'pinning', 'wallet', 'name']) expect(output.toLowerCase()).not.toContain(forbidden)
})

test.each(vectors.sets)('canonical collected vector with $size entries reproduces its approved root after reload', async vector => {
  const env = await start()
  for (const entry of [...vector.entries].reverse()) env.scan(entry as Hex)
  // A held code/duplicate never changes the saved set or count.
  if (vector.entries.length > 1) env.scan(vector.entries[1] as Hex)
  if (vector.entries.length) { env.scan(vector.entries[0] as Hex); env.scan(vector.entries[0] as Hex) }
  env.session.stop()
  const reloaded = setup({ storage: env.storage })
  await reloaded.app.connect()
  // Preparation does not require starting a camera after reload.
  const result = await reloaded.app.prepareAttendanceSet({ proposalId: 42n })
  expect(result.status).toBe('prepared')
  if (result.status !== 'prepared') return
  expect(result.set.root).toBe(vector.root)
  expect(result.set.count).toBe(vector.size)
  expect(result.set.entries).toEqual(vector.entries)
  expect(reloaded.app.readPreparedAttendanceSet({ proposalId: 42n })).toEqual(result)
}, 60000)

test('more than 1024 unique collected entries rejects preparation without truncation', async () => {
  const env = await start()
  for (let i = 0; i < 1025; i++) env.scan(hex(BigInt(i)))
  expect(env.session.read().count).toBe(1025)
  expect(await env.app.prepareAttendanceSet({ proposalId: 42n })).toMatchObject({ status: 'invalid', message: expect.stringContaining('1,024') })
  expect(env.app.readPreparedAttendanceSet({ proposalId: 42n }).status).toBe('not-prepared')
})

test('entry changes invalidate an immutable preview; duplicates leave the same exact snapshot valid', async () => {
  const env = await start()
  env.scan(hex(1n))
  const first = await env.app.prepareAttendanceSet({ proposalId: 42n })
  if (first.status !== 'prepared') throw new Error(first.message)
  env.scan(hex(1n))
  expect(env.app.readPreparedAttendanceSet({ proposalId: 42n })).toEqual(first)
  env.scan(hex(2n))
  expect(env.app.readPreparedAttendanceSet({ proposalId: 42n }).status).toBe('stale')
  expect(first.set.count).toBe(1)
  expect(first.set.entries).toEqual([hex(1n)])
  const next = await env.app.prepareAttendanceSet({ proposalId: 42n })
  expect(next.status === 'prepared' && next.set.count).toBe(2)
  expect(next.status === 'prepared' && next.set.root).not.toBe(first.set.root)
})

test('scanning during asynchronous preparation cannot install an old preview', async () => {
  const env = await start()
  env.scan(hex(1n))
  const pending = env.app.prepareAttendanceSet({ proposalId: 42n })
  // Let context reads complete and hash execution begin without replacing crypto.
  await new Promise(resolve => setTimeout(resolve, 5))
  env.scan(hex(2n))
  expect(await pending).toMatchObject({ status: 'stale' })
  expect(env.app.readPreparedAttendanceSet({ proposalId: 42n }).status).toBe('not-prepared')
})

test('another tab modifying saved entries invalidates a preview and requires reload, not a stale in-memory preparation', async () => {
  const env = await start()
  env.scan(hex(1n))
  expect((await env.app.prepareAttendanceSet({ proposalId: 42n })).status).toBe('prepared')
  const [key, raw] = [...env.data][0]
  env.data.set(key, JSON.stringify({ ...JSON.parse(raw), entries: [hex(1n), hex(2n)] }))
  expect(env.app.readPreparedAttendanceSet({ proposalId: 42n }).status).toBe('stale')
  expect((await env.app.prepareAttendanceSet({ proposalId: 42n })).status).toBe('unsaved')
})

test.each(['account', 'chain'])('a wallet %s change during preparation cannot install a preview', async change => {
  const env = await start()
  env.scan(hex(1n))
  const pending = env.app.prepareAttendanceSet({ proposalId: 42n })
  await new Promise(resolve => setTimeout(resolve, 5))
  if (change === 'account') env.changeAccount(TOKEN)
  else env.changeChain(98)
  expect((await pending).status).toBe('stale')
  expect(env.app.readPreparedAttendanceSet({ proposalId: 42n }).status).toBe('not-prepared')
})

test('v1, mixed-version, wrong-context and noncanonical QR inputs cannot contaminate a v2 collection', async () => {
  const env = await start()
  const good = encodeAttendanceV2Qr(env.event, hex(0n))
  const invalid = [
    encodeAttendanceQr({ ...env.event, entry: hex(1n) }),
    encodeAttendanceV2Qr({ ...env.event, chainId: 98 }, hex(1n)),
    encodeAttendanceV2Qr({ ...env.event, proposalId: 43n }, hex(1n)),
    encodeAttendanceV2Qr({ ...env.event, daoAddress: TOKEN }, hex(1n)),
    good.replace(hex(0n), hex(ATTENDANCE_FIELD)),
    good.replace(hex(0n), '0x0'), `${good}\n`,
    good.replace(hex(0n), hex(ATTENDANCE_FIELD - 1n).toUpperCase()),
    good.replace(hex(0n), ' -1 '),
    good.replace('"chainId":"97"', '"chainId":97'),
    good.replace('"proposalId":"42"', '"proposalId":"042"'),
    good.replace('"schema":', '"secret":"oops","schema":'),
    good.replace('"schema":', '"schema":"attendance-qr/v2","schema":'),
  ]
  for (const payload of invalid) env.payload(payload)
  expect(env.session.read().count).toBe(0)
  env.payload(good)
  expect(env.session.read().entries).toEqual([hex(0n)])
})

test('credentials recovered by two real EOAs are collected without identity and prepare identically in either scan order', async () => {
  const other = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
  const attendee = setup({ account: other.address, signer: message => other.signMessage({ message }) })
  const organizer = await start()
  await attendee.app.connect()
  const a = await organizer.app.prepareAttendanceCredential({ proposalId: 42n })
  const b = await attendee.app.prepareAttendanceCredential({ proposalId: 42n })
  if (a.status !== 'ready' || b.status !== 'ready') throw new Error('Expected EOA credentials')
  expect(a.entry).not.toBe(b.entry)
  organizer.payload(b.qr); organizer.payload(a.qr); organizer.payload(b.qr)
  const prepared = await organizer.app.prepareAttendanceSet({ proposalId: 42n })
  const reverse = await start()
  reverse.payload(a.qr); reverse.payload(b.qr)
  const again = await reverse.app.prepareAttendanceSet({ proposalId: 42n })
  expect(again).toEqual(prepared)
  expect(organizer.session.read().count).toBe(2)
  expect(JSON.stringify(prepared).toLowerCase()).not.toContain(other.address.toLowerCase())
})

test('event/deployment/chain isolation, uint256 proposal limbs and organizer authorization are preserved', async () => {
  const storage = setup().storage
  const a = await start({ storage })
  a.scan(hex(1n))
  const base = await a.app.prepareAttendanceSet({ proposalId: 42n })
  const roots: string[] = []
  for (const options of [{ chainId: 98 }, { dao: TOKEN }, { proposalId: 43n }, { proposalId: (1n << 256n) - 1n }]) {
    const env = await start({ storage, ...options })
    expect(env.session.read().count).toBe(0)
    env.scan(hex(1n))
    const prepared = await env.app.prepareAttendanceSet({ proposalId: env.event.proposalId })
    if (prepared.status !== 'prepared') throw new Error(prepared.message)
    roots.push(prepared.set.root)
  }
  expect(new Set(roots).size).toBe(4)
  expect(base.status === 'prepared' && roots.includes(base.set.root)).toBe(false)
  const other = setup({ organizer: TOKEN })
  await other.app.connect()
  expect((await other.app.prepareAttendanceSet({ proposalId: 42n })).status).toBe('not-organizer')
})

test('frozen v1 and unknown versions never become a v2 prepared set', async () => {
  const v1 = setup({ version: 1 })
  await v1.app.connect()
  expect((await v1.app.prepareAttendanceSet({ proposalId: 42n })).status).toBe('unsupported-version')
  const unknown = setup({ version: 3 })
  await unknown.app.connect()
  expect((await unknown.app.prepareAttendanceCredential({ proposalId: 42n })).status).toBe('read-failed')
})

test('v2 recovery normalizes 0/1 but rejects high-s, compact signatures and signatures from another EOA', async () => {
  const normalized = setup({ signer: async () => `${vectors.signature.slice(0, 130)}01` as Hex })
  await normalized.app.connect()
  const good = await normalized.app.prepareAttendanceCredential({ proposalId: 42n })
  expect(good.status === 'ready' && good.entry).toBe(vectors.entry)
  const invalid = [
    `${vectors.signature.slice(0, 66)}${'f'.repeat(64)}1c`,
    vectors.signature.slice(0, 130),
    await privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d').signMessage({ message: vectors.message }),
  ]
  for (const signature of invalid) {
    const env = setup({ signer: async () => signature as Hex })
    await env.app.connect()
    expect((await env.app.prepareAttendanceCredential({ proposalId: 42n })).status).toBe('signing-failed')
  }
})

test('corrupt, unavailable and unsaved storage never produces a misleading prepared set', async () => {
  for (const storage of [
    { getItem: () => '{', setItem() {} },
    { getItem: () => { throw new Error('denied') }, setItem() {} },
    { getItem: () => null, setItem: () => { throw new Error('quota') } },
  ]) {
    const env = await start({ storage })
    if (env.session.read().storage.status === 'empty') env.scan(hex(1n))
    expect((await env.app.prepareAttendanceSet({ proposalId: 42n })).status).toBe('unsaved')
  }
})
