import { expect, test, vi } from 'vitest'
import type { Address } from 'viem'
import { createApplication } from './application'
import { CameraError, type CameraScanner } from './attendanceScan'
import { encodeAttendanceQr } from './attendance'
import type { RpcAdapter } from './rpc'
import type { WalletAdapter } from './wallet'

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

function setup(options: { account?: Address | null; creator?: Address; camera?: CameraScanner } = {}) {
  const account = options.account === undefined ? ORGANIZER : options.account
  const sendTransaction = vi.fn()
  const wallet = {
    isAvailable: () => true,
    connect: async () => account,
    disconnect: async () => {},
    getAccount: async () => account,
    getChainId: async () => 31337,
    onAccountChanged: () => () => {},
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
  const rpc = { getChainId: async () => 31337, readContract } as unknown as RpcAdapter
  const app = createApplication(wallet, rpc, { chainId: 31337, daoAddress: DAO, testUsdAddress: TOKEN }, { camera: options.camera })
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
  cam.scan(qr()) // identical entry
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
  expect(Object.keys(session.read()).sort()).toEqual(['count', 'entries', 'event'])
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
