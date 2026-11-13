import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Address } from 'viem'
import { createApplication } from './application'
import { createBrowserCameraScanner } from './browserCamera'
import { REPEAT_DETECTION_WINDOW_MS, CameraError, type CameraScanner } from './attendanceScan'
import { encodeAttendanceQr } from './attendance'
import type { AttendanceStorage } from './attendanceStorage'
import type { RpcAdapter } from './rpc'
import type { WalletAdapter } from './wallet'

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }) })
afterEach(() => { vi.useRealTimers() })
const nextFrameBurst = () => vi.setSystemTime(Date.now() + REPEAT_DETECTION_WINDOW_MS + 1)

const DAO: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const OTHER_DAO: Address = '0x00000000000000000000000000000000000000d1'
const ORGANIZER: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const ATTENDEE_WALLET: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const ENTRY_A = `0x${'a1'.repeat(32)}` as const
const ENTRY_B = `0x${'b2'.repeat(32)}` as const
const TOKEN = '0x00000000000000000000000000000000000000aa'

function qr(overrides: { chainId?: number; daoAddress?: Address; proposalId?: bigint; entry?: `0x${string}` } = {}) {
  return encodeAttendanceQr({
    chainId: overrides.chainId ?? 31337,
    daoAddress: overrides.daoAddress ?? DAO,
    proposalId: overrides.proposalId ?? 1n,
    entry: overrides.entry ?? ENTRY_A,
  })
}

/** Controlled camera transport: the test pushes decoded QR text, as a real decoder would. */
function fakeCamera(failure?: CameraError) {
  let emit: (payload: string) => void = () => {}
  const stop = vi.fn()
  const camera: CameraScanner = {
    async start(onPayload) {
      if (failure) throw failure
      emit = onPayload
      return { stop }
    },
  }
  return { camera, scan: (payload: string) => emit(payload), stop }
}

function setup(options: { account?: Address | null; creator?: Address; camera?: CameraScanner; accountChanged?: { fire?: (account: Address) => void }; storage?: AttendanceStorage; chainId?: number; dao?: Address } = {}) {
  const account = options.account === undefined ? ORGANIZER : options.account
  const sendTransaction = vi.fn()
  const wallet = {
    isAvailable: () => true,
    connect: async () => account,
    disconnect: async () => {},
    getAccount: async () => account,
    getChainId: async () => options.chainId ?? 31337,
    onAccountChanged: (handler: (event: { account: Address | null }) => void) => {
      if (options.accountChanged) options.accountChanged.fire = account => handler({ account })
      return () => {}
    },
    onChainChanged: () => () => {},
    switchChain: async () => {},
    sendTransaction,
    signMessage: vi.fn(),
  } as unknown as WalletAdapter
  const readContract = vi.fn(async (request: { functionName: string }) => {
    if (request.functionName === 'proposalCount') return 1n
    if (request.functionName === 'getProposal') {
      return {
        id: 1n, treasury: TOKEN, creator: options.creator ?? ORGANIZER, amount: 5n,
        payoutRecipient: ORGANIZER, votingDeadline: 99n, documentReference: 'ipfs://x',
      }
    }
    throw new Error(`unexpected read ${request.functionName}`)
  })
  const rpc = { getChainId: async () => options.chainId ?? 31337, readContract } as unknown as RpcAdapter
  const app = createApplication(wallet, rpc, { chainId: options.chainId ?? 31337, daoAddress: options.dao ?? DAO, testUsdAddress: TOKEN }, { camera: options.camera, attendanceStorage: options.storage })
  return { app, sendTransaction }
}

async function start(options: Parameters<typeof setup>[0] = {}) {
  const cam = fakeCamera()
  const env = setup({ camera: cam.camera, ...options })
  await env.app.connect()
  const result = await env.app.startAttendanceScan({ proposalId: 1n })
  if (result.status !== 'scanning') throw new Error(`expected scanning, got ${result.status}`)
  return { ...env, cam, session: result.session }
}

test('the proposal creator scans a valid QR; it is accepted and counted with the event context', async () => {
  const { cam, session, sendTransaction } = await start()
  expect(session.read()).toEqual({
    event: { chainId: 31337, daoAddress: DAO, proposalId: 1n },
    count: 0,
    entries: [],
    storage: { status: 'unavailable', message: expect.any(String) },
  })

  cam.scan(qr({ entry: ENTRY_A }))
  cam.scan(qr({ entry: ENTRY_B }))

  expect(session.read().count).toBe(2)
  expect(session.read().entries).toEqual([ENTRY_A, ENTRY_B])
  expect(sendTransaction).not.toHaveBeenCalled()
})

test('scan feedback reports accepted, duplicate, and rejected outcomes without changing the count wrongly', async () => {
  const { cam, session } = await start()
  const seen: string[] = []
  session.onScan(result => seen.push(`${result.status}:${result.count}`))

  cam.scan(qr())
  nextFrameBurst()
  cam.scan(qr()) // identical entry, scanned again later
  cam.scan(qr({ entry: ENTRY_A.toUpperCase().replace('0X', '0x') as `0x${string}` })) // same entry, other casing
  cam.scan('not json')

  expect(seen).toEqual(['accepted:1', 'duplicate:1', 'duplicate:1', 'rejected:1'])
  expect(session.read().entries).toEqual([ENTRY_A])
})

test('wrong chain, deployment, or proposal is rejected and never added', async () => {
  const { cam, session } = await start()
  const results: unknown[] = []
  session.onScan(r => results.push(r))

  cam.scan(qr({ chainId: 97 }))
  cam.scan(qr({ daoAddress: OTHER_DAO }))
  cam.scan(qr({ proposalId: 2n }))

  expect(results).toMatchObject([
    { status: 'rejected', reason: 'wrong-event' },
    { status: 'rejected', reason: 'wrong-event' },
    { status: 'rejected', reason: 'wrong-event' },
  ])
  expect(session.read().count).toBe(0)
})

test('malformed payloads are rejected with a reason and never added', async () => {
  const { cam, session } = await start()
  const good = JSON.parse(qr())
  const payloads = [
    '',
    'hello',
    '[]',
    'null',
    JSON.stringify({ ...good, v: 2 }),
    JSON.stringify({ ...good, entry: '0x1234' }),
    JSON.stringify({ ...good, entry: `0x${'zz'.repeat(32)}` }),
    JSON.stringify({ ...good, dao: 'not-an-address' }),
    JSON.stringify({ ...good, proposalId: '-1' }),
    JSON.stringify({ ...good, chainId: '31337' }),
    JSON.stringify({ v: 1 }),
  ]
  const reasons: string[] = []
  session.onScan(r => reasons.push(r.status === 'rejected' ? r.reason : r.status))
  payloads.forEach(p => cam.scan(p))

  expect(reasons).toEqual(payloads.map(() => 'malformed'))
  expect(session.read().count).toBe(0)
})

test('payloads carrying secret-bearing or identity fields are rejected, not silently trimmed', async () => {
  const { cam, session } = await start()
  const good = JSON.parse(qr())
  const results: unknown[] = []
  session.onScan(r => results.push(r))

  cam.scan(JSON.stringify({ ...good, secret: `0x${'11'.repeat(32)}` }))
  cam.scan(JSON.stringify({ ...good, signature: `0x${'22'.repeat(65)}` }))
  cam.scan(JSON.stringify({ ...good, attendee: ATTENDEE_WALLET, name: 'Ada' }))

  expect(results).toMatchObject([
    { status: 'rejected', reason: 'unexpected-fields' },
    { status: 'rejected', reason: 'unexpected-fields' },
    { status: 'rejected', reason: 'unexpected-fields' },
  ])
  expect(session.read().count).toBe(0)
  // Feedback never echoes the rejected payload (it may hold a secret).
  expect(JSON.stringify(results)).not.toContain('1111')
  expect(JSON.stringify(results)).not.toContain('2222')
})

test('the collection holds only hashed entries and event context', async () => {
  const { cam, session } = await start()
  cam.scan(qr())
  expect(Object.keys(session.read()).sort()).toEqual(['count', 'entries', 'event', 'storage'])
  expect(Object.keys(session.read().event).sort()).toEqual(['chainId', 'daoAddress', 'proposalId'])
})

test('only the proposal creator may scan, and no attendee NFT or chain transaction is needed', async () => {
  const cam = fakeCamera()
  const stranger = setup({ camera: cam.camera, creator: OTHER_DAO })
  await stranger.app.connect()
  expect(await stranger.app.startAttendanceScan({ proposalId: 1n })).toMatchObject({ status: 'not-organizer' })

  const disconnected = setup({ camera: cam.camera })
  expect(await disconnected.app.startAttendanceScan({ proposalId: 1n })).toMatchObject({ status: 'wallet-not-connected' })
})

test('unknown proposals and invalid IDs do not start scanning', async () => {
  const cam = fakeCamera()
  const { app } = setup({ camera: cam.camera })
  await app.connect()
  expect(await app.startAttendanceScan({ proposalId: 2n })).toMatchObject({ status: 'not-found' })
  expect(await app.startAttendanceScan({ proposalId: -1n })).toMatchObject({ status: 'invalid-proposal-id' })
})

test('camera permission denial and missing camera are explained and leave nothing collected', async () => {
  const denied = fakeCamera(new CameraError('permission-denied'))
  const { app } = setup({ camera: denied.camera })
  await app.connect()
  expect(await app.startAttendanceScan({ proposalId: 1n })).toMatchObject({ status: 'camera-permission-denied' })

  const none = setup()
  await none.app.connect()
  expect(await none.app.startAttendanceScan({ proposalId: 1n })).toMatchObject({ status: 'camera-unavailable' })
})

test('stopping the camera keeps accepted entries; restarting continues the same deduplicated set', async () => {
  const cam = fakeCamera()
  const { app } = setup({ camera: cam.camera })
  await app.connect()
  const first = await app.startAttendanceScan({ proposalId: 1n })
  if (first.status !== 'scanning') throw new Error('expected scanning')
  cam.scan(qr())

  first.session.stop()
  expect(cam.stop).toHaveBeenCalled()
  cam.scan(qr({ entry: ENTRY_B })) // late frame after stop is ignored
  expect(first.session.read().count).toBe(1)

  const second = await app.startAttendanceScan({ proposalId: 1n })
  if (second.status !== 'scanning') throw new Error('expected scanning')
  expect(second.session.read().entries).toEqual([ENTRY_A])
  cam.scan(qr()) // dedupe survives a camera restart
  expect(second.session.read().count).toBe(1)
})

test('the camera re-detecting a held code does not overwrite the accepted feedback', async () => {
  const { cam, session } = await start()
  const seen: string[] = []
  session.onScan(result => seen.push(`${result.status}:${result.count}`))

  cam.scan(qr())
  cam.scan(qr()) // next frames still see the same code
  cam.scan(qr())
  expect(seen).toEqual(['accepted:1'])

  cam.scan(qr({ entry: ENTRY_B })) // a different code is a new scan
  nextFrameBurst()
  cam.scan(qr({ entry: ENTRY_B })) // deliberate rescan later is reported as a duplicate
  expect(seen).toEqual(['accepted:1', 'accepted:2', 'duplicate:2'])
})

test('a session stops itself when the connected account is no longer the proposal creator', async () => {
  const cam = fakeCamera()
  const changes: { fire?: (account: Address) => void } = {}
  const env = setup({ camera: cam.camera, accountChanged: changes })
  await env.app.connect()
  const result = await env.app.startAttendanceScan({ proposalId: 1n })
  if (result.status !== 'scanning') throw new Error('expected scanning')
  const stopped = vi.fn()
  result.session.onStop(stopped)

  cam.scan(qr())
  changes.fire?.(ATTENDEE_WALLET) // wallet switches to another account
  cam.scan(qr({ entry: ENTRY_B }))

  expect(result.session.read().entries).toEqual([ENTRY_A])
  expect(cam.stop).toHaveBeenCalled()
  expect(stopped).toHaveBeenCalledTimes(1)
})

test('starting a second scan for the same event stops the first camera', async () => {
  const first = fakeCamera()
  const { app } = setup({ camera: first.camera })
  await app.connect()
  const a = await app.startAttendanceScan({ proposalId: 1n })
  const b = await app.startAttendanceScan({ proposalId: 1n })
  if (a.status !== 'scanning' || b.status !== 'scanning') throw new Error('expected scanning')

  expect(first.stop).toHaveBeenCalledTimes(1)
  first.scan(qr())
  expect(b.session.read().count).toBe(1)
})

test('browser camera maps permission errors and other failures to explained camera errors', async () => {
  const detector = class { async detect() { return [] } }
  const failing = (name: string) =>
    createBrowserCameraScanner(() => ({
      BarcodeDetector: detector,
      mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error('x'), { name }) } },
    }))
  await expect(failing('NotAllowedError').start(() => {})).rejects.toMatchObject({ kind: 'permission-denied' })
  await expect(failing('NotFoundError').start(() => {})).rejects.toMatchObject({ kind: 'unavailable' })
  await expect(createBrowserCameraScanner(() => ({})).start(() => {})).rejects.toMatchObject({ kind: 'unavailable' })
})

// ---------------------------------------------------------------------------
// Spec 06.03: local persistence
// ---------------------------------------------------------------------------

/** Controlled browser storage: a Map with switchable failures. */
function fakeStorage() {
  const data = new Map<string, string>()
  const fail = { read: false, write: false }
  const storage: AttendanceStorage = {
    getItem(key) { if (fail.read) throw new Error('SecurityError'); return data.get(key) ?? null },
    setItem(key, value) { if (fail.write) throw new Error('QuotaExceededError'); data.set(key, value) },
  }
  return { storage, data, fail }
}

/** A page reload: a fresh application and camera over the same storage. */
const reload = (storage: AttendanceStorage, options: Parameters<typeof setup>[0] = {}) => start({ storage, ...options })

test('accepted entries are saved and restored with the same count after a reload', async () => {
  const { storage } = fakeStorage()
  const first = await start({ storage })
  const seen: unknown[] = []
  first.session.onScan(r => seen.push(r))
  first.cam.scan(qr({ entry: ENTRY_A }))
  first.cam.scan(qr({ entry: ENTRY_B }))
  expect(seen).toMatchObject([{ status: 'accepted', saved: true }, { status: 'accepted', saved: true }])
  expect(first.session.read().storage.status).toBe('saved')

  const second = await reload(storage)
  expect(second.session.read()).toMatchObject({ count: 2, entries: [ENTRY_A, ENTRY_B], storage: { status: 'saved' } })
})

test('rescanning an existing entry after a reload is a duplicate', async () => {
  const { storage } = fakeStorage()
  const first = await start({ storage })
  first.cam.scan(qr({ entry: ENTRY_A }))

  const second = await reload(storage)
  const seen: unknown[] = []
  second.session.onScan(r => seen.push(r))
  second.cam.scan(qr({ entry: ENTRY_A }))
  second.cam.scan(qr({ entry: ENTRY_B }))
  expect(seen).toMatchObject([{ status: 'duplicate', count: 1 }, { status: 'accepted', count: 2 }])
})

test('events and deployments keep separate attendance sets', async () => {
  const { storage } = fakeStorage()
  const event1 = await start({ storage })
  event1.cam.scan(qr({ entry: ENTRY_A }))

  // A different DAO deployment and a different chain start empty.
  const otherDao = await start({ storage, dao: OTHER_DAO })
  expect(otherDao.session.read()).toMatchObject({ count: 0, entries: [] })
  otherDao.cam.scan(qr({ daoAddress: OTHER_DAO, entry: ENTRY_B }))
  const otherChain = await start({ storage, chainId: 97 })
  expect(otherChain.session.read().count).toBe(0)

  // Each deployment still resumes only its own set.
  expect((await reload(storage)).session.read().entries).toEqual([ENTRY_A])
  expect((await reload(storage, { dao: OTHER_DAO })).session.read().entries).toEqual([ENTRY_B])
})

test('only hashed entries and event metadata are persisted', async () => {
  const { storage, data } = fakeStorage()
  const { cam } = await start({ storage })
  cam.scan(qr({ entry: ENTRY_A }))
  const saved = [...data.values()].join('')
  expect(JSON.parse([...data.values()][0])).toEqual({
    schema: 1, chainId: 31337, dao: DAO.toLowerCase(), proposalId: '1', entries: [ENTRY_A],
  })
  expect(saved).not.toContain(ORGANIZER.toLowerCase())
  expect(saved).not.toContain(ATTENDEE_WALLET.toLowerCase())
})

test('malformed saved data is reported, never restored, and replaced by the next accepted entry', async () => {
  const good = { schema: 1, chainId: 31337, dao: DAO.toLowerCase(), proposalId: '1', entries: [ENTRY_A] }
  const bad = [
    'not json', '{"schema":1}', '[]', 'null',
    JSON.stringify({ ...good, schema: 2 }),
    JSON.stringify({ ...good, entries: ['zz'] }),
    JSON.stringify({ ...good, dao: OTHER_DAO }),
    JSON.stringify({ ...good, proposalId: '2' }),
  ]
  for (const value of bad) {
    const { storage, data } = fakeStorage()
    const seed = await start({ storage })
    seed.cam.scan(qr({ entry: ENTRY_B })) // creates the key
    data.set([...data.keys()][0], value)

    const again = await reload(storage)
    expect(again.session.read()).toMatchObject({ count: 0, entries: [], storage: { status: 'corrupt' } })
    again.cam.scan(qr({ entry: ENTRY_A }))
    expect(again.session.read()).toMatchObject({ entries: [ENTRY_A], storage: { status: 'saved' } })
  }
})

test('a failed write is reported as unsaved, keeps the entry in this session, and recovers on a later save', async () => {
  const { storage, fail } = fakeStorage()
  const { cam, session } = await start({ storage })
  const seen: unknown[] = []
  session.onScan(r => seen.push(r))
  fail.write = true
  cam.scan(qr({ entry: ENTRY_A }))
  expect(seen[0]).toMatchObject({ status: 'accepted', saved: false, count: 1 })
  expect(session.read()).toMatchObject({ count: 1, storage: { status: 'save-failed' } })
  expect((await reload(storage)).session.read().count).toBe(0)

  fail.write = false
  cam.scan(qr({ entry: ENTRY_B }))
  expect(session.read().storage.status).toBe('saved')
  expect((await reload(storage)).session.read().entries).toEqual([ENTRY_A, ENTRY_B])
})

test('denied storage is reported as unavailable while collection still works', async () => {
  const { storage, fail } = fakeStorage()
  fail.read = true
  const { cam, session, sendTransaction } = await start({ storage })
  expect(session.read().storage.status).toBe('unavailable')
  cam.scan(qr({ entry: ENTRY_A }))
  expect(session.read()).toMatchObject({ count: 1, storage: { status: 'unavailable' } })
  expect(sendTransaction).not.toHaveBeenCalled()
})
