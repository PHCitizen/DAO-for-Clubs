import { createHash } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { getAddress, type Address } from 'viem'
import { createApplication } from './application'
import { IpfsTransportError, type IpfsTransport } from './ipfs'
import { encodeProposalDocument, MAX_PROPOSAL_DOCUMENT_BYTES } from './proposal'
import type { RpcAdapter } from './rpc'

const DAO = '0x00000000000000000000000000000000000000d1' as Address
const TEST_USD = '0x0000000000000000000000000000000000000075' as Address
const TREASURY_A = getAddress('0x00000000000000000000000000000000000000a1')
const TREASURY_B = getAddress('0x00000000000000000000000000000000000000b2')
const CREATOR_1 = getAddress('0x00000000000000000000000000000000000000c3')
const CREATOR_2 = getAddress('0x00000000000000000000000000000000000000c4')
const DEADLINE = 1_900_000_000n

// Independent CIDv1 (raw codec, sha2-256) construction used to publish bytes.
function rawCidFor(bytes: Uint8Array): string {
  return cidV1(0x55, createHash('sha256').update(bytes).digest())
}

function cidV1(codec: number, digest: Uint8Array): string {
  const cid = Buffer.concat([Buffer.from([0x01, codec, 0x12, 0x20]), digest])
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
  let bits = 0
  let buffer = 0
  let out = ''
  for (const byte of cid) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += alphabet[(buffer >> bits) & 31]
    }
  }
  if (bits > 0) out += alphabet[(buffer << (5 - bits)) & 31]
  return `b${out}`
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

function publish(content: Map<string, Uint8Array>, bytes: Uint8Array): string {
  const cid = rawCidFor(bytes)
  content.set(cid, bytes)
  return `ipfs://${cid}`
}

interface ProposalRecord {
  id: bigint
  treasury: Address
  creator: Address
  amount: bigint
  payoutRecipient: Address
  votingDeadline: bigint
  documentReference: string
}

function record(id: bigint, treasury: Address, creator: Address, reference: string, amount = 5n * 10n ** 18n): ProposalRecord {
  return {
    id,
    treasury,
    creator,
    amount,
    payoutRecipient: creator,
    votingDeadline: DEADLINE,
    documentReference: reference,
  }
}

function makeReader(options: { rpcDown?: boolean } = {}) {
  const proposals = new Map<bigint, ProposalRecord>()
  const content = new Map<string, Uint8Array>()
  // Scripted proposalCount answers; the last one repeats.
  let countQueue: bigint[] = []
  const retrieval = {
    failure: null as IpfsTransportError | null,
    calls: [] as string[],
  }

  const rpc = {
    getChainId: vi.fn(async () => {
      if (options.rpcDown) throw new Error('connection refused')
      return 31337
    }),
    getBlockNumber: vi.fn(async () => 1n),
    readContract: vi.fn(async (request: { functionName: string; args?: readonly unknown[] }) => {
      switch (request.functionName) {
        case 'decimals':
          return 18
        case 'symbol':
          return 'TUSD'
        case 'proposalCount':
          return countQueue.length > 1 ? countQueue.shift()! : (countQueue[0] ?? BigInt(proposals.size))
        case 'getProposal': {
          const found = proposals.get(request.args![0] as bigint)
          if (!found) throw new Error('ProposalNotFound')
          return found
        }
        default:
          throw new Error(`Unexpected read: ${request.functionName}`)
      }
    }),
  } as unknown as RpcAdapter

  const ipfs: IpfsTransport = {
    pin: vi.fn(),
    retrieve: vi.fn(async (cid: string) => {
      retrieval.calls.push(cid)
      if (retrieval.failure) throw retrieval.failure
      const bytes = content.get(cid)
      if (!bytes) throw new IpfsTransportError('content-not-found', 'not pinned')
      return bytes
    }),
  }

  // No wallet adapter: readers never connect.
  const app = createApplication(undefined, rpc, {
    chainId: 31337,
    daoAddress: DAO,
    testUsdAddress: TEST_USD,
  }, { ipfs })

  return { app, rpc, proposals, content, retrieval, countReads: (counts: bigint[]) => { countQueue = [...counts] } }
}

function addDocument(
  state: ReturnType<typeof makeReader>,
  id: bigint,
  treasury: Address,
  creator: Address,
  document: { title: string; markdown: string }
) {
  const bytes = encodeProposalDocument({ version: 1, ...document })
  const reference = publish(state.content, bytes)
  state.proposals.set(id, record(id, treasury, creator, reference))
  return reference
}

test('a wallet-free reader discovers proposals across treasuries, newest first', async () => {
  const state = makeReader()
  const refA = addDocument(state, 1n, TREASURY_A, CREATOR_1, { title: 'Club day', markdown: 'Lunch' })
  const refB = addDocument(state, 2n, TREASURY_B, CREATOR_2, { title: 'Hack night', markdown: 'Pizza' })

  const result = await state.app.listProposals()

  expect(result.status).toBe('success')
  if (result.status !== 'success') return
  expect(result.chainId).toBe(31337)
  expect(result.daoAddress).toBe(DAO)
  expect(result.proposals.map((p) => p.proposal.id)).toEqual([2n, 1n])
  expect(result.proposals[0]).toMatchObject({
    proposal: {
      id: 2n,
      treasury: TREASURY_B,
      creator: CREATOR_2,
      votingDeadline: DEADLINE,
      documentReference: refB,
    },
    formattedAmount: '5',
    symbol: 'TUSD',
  })
  expect(result.proposals[1]!.proposal.documentReference).toBe(refA)
  expect(result.gaps).toEqual([])
  // Discovery is on-chain record only; documents are fetched on demand.
  expect(state.retrieval.calls).toEqual([])
})

test('reading a published proposal verifies and renders its document', async () => {
  const state = makeReader()
  const reference = addDocument(state, 1n, TREASURY_A, CREATOR_1, {
    title: 'Club day',
    markdown: '# Agenda\n\n**Lunch**',
  })

  const result = await state.app.readPublishedProposal(1n)

  expect(result.status).toBe('success')
  if (result.status !== 'success') return
  expect(result.daoAddress).toBe(DAO)
  expect(result.proposal).toMatchObject({ id: 1n, treasury: TREASURY_A, creator: CREATOR_1, documentReference: reference })
  expect(result.document).toEqual({
    status: 'available',
    cid: reference.slice('ipfs://'.length),
    title: 'Club day',
    markdown: '# Agenda\n\n**Lunch**',
    html: '<h1>Agenda</h1>\n<p><strong>Lunch</strong></p>\n',
  })
})

test('published Markdown is rendered with the shared safe policy', async () => {
  const state = makeReader()
  addDocument(state, 1n, TREASURY_A, CREATOR_1, {
    title: 'Evil',
    markdown: '<script>alert(1)</script>\n\n[click](javascript:alert(1)) ![x](data:text/html,hi)',
  })

  const result = await state.app.readPublishedProposal(1n)

  expect(result.status).toBe('success')
  if (result.status !== 'success' || result.document.status !== 'available') throw new Error('expected document')
  expect(result.document.html).not.toContain('<script')
  expect(result.document.html).not.toContain('href=')
  expect(result.document.html).not.toContain('<img')
  expect(result.document.html).toContain('&lt;script&gt;')
})

test('nonexistent proposals are not-found rather than a document error', async () => {
  const state = makeReader()
  addDocument(state, 1n, TREASURY_A, CREATOR_1, { title: 'Club day', markdown: 'x' })

  expect(await state.app.readPublishedProposal(7n)).toEqual({ status: 'not-found', id: 7n })
  expect(await state.app.readPublishedProposal(0n)).toEqual({ status: 'not-found', id: 0n })
  expect(state.retrieval.calls).toEqual([])
})

test('document failures keep the on-chain record and are categorized', async () => {
  const state = makeReader()
  const reference = addDocument(state, 1n, TREASURY_A, CREATOR_1, { title: 'Club day', markdown: 'x' })

  // Unavailable: nothing pinned under the recorded CID.
  state.content.clear()
  let result = await state.app.readPublishedProposal(1n)
  expect(result).toMatchObject({
    status: 'success',
    proposal: { id: 1n, documentReference: reference },
    document: { status: 'unavailable', retryable: true },
  })

  // Transport failure: gateway unreachable.
  state.retrieval.failure = new IpfsTransportError('retrieval-failed', 'gateway down')
  result = await state.app.readPublishedProposal(1n)
  expect(result).toMatchObject({
    status: 'success',
    proposal: { id: 1n },
    document: { status: 'transport-failure', retryable: true },
  })
})

test('retrying after a retrieval failure shows the document', async () => {
  const state = makeReader()
  const reference = addDocument(state, 1n, TREASURY_A, CREATOR_1, { title: 'Club day', markdown: 'Lunch' })
  const cid = reference.slice('ipfs://'.length)
  const bytes = state.content.get(cid)!
  state.retrieval.failure = new IpfsTransportError('retrieval-failed', 'gateway down')

  const failed = await state.app.readPublishedProposal(1n)
  expect(failed).toMatchObject({ document: { status: 'transport-failure' } })

  state.retrieval.failure = null
  state.content.set(cid, bytes)
  const retried = await state.app.readPublishedProposal(1n)
  expect(retried).toMatchObject({ document: { status: 'available', title: 'Club day' } })
})

test('malformed, wrong-version, and extra-field documents are invalid', async () => {
  const state = makeReader()
  const bad: Uint8Array[] = [
    new TextEncoder().encode('not json at all'),
    jsonBytes({ version: 2, title: 'T', markdown: 'm' }),
    jsonBytes({ version: 1, title: 'T', markdown: 'm', extra: true }),
    jsonBytes({ version: 1, title: '', markdown: 'm' }),
  ]
  bad.forEach((bytes, index) => {
    const id = BigInt(index + 1)
    state.proposals.set(id, record(id, TREASURY_A, CREATOR_1, publish(state.content, bytes)))
  })

  for (let id = 1n; id <= 4n; id += 1n) {
    const result = await state.app.readPublishedProposal(id)
    expect(result).toMatchObject({
      status: 'success',
      proposal: { id },
      document: { status: 'invalid-document', retryable: false },
    })
  }
})

test('content that does not hash to the recorded reference is a mismatch', async () => {
  const state = makeReader()
  const reference = addDocument(state, 1n, TREASURY_A, CREATOR_1, { title: 'Club day', markdown: 'x' })
  // A well-formed document, but not the one the CID commits to.
  state.content.set(
    reference.slice('ipfs://'.length),
    encodeProposalDocument({ version: 1, title: 'Impostor', markdown: 'send funds' })
  )

  const result = await state.app.readPublishedProposal(1n)

  expect(result).toMatchObject({
    status: 'success',
    proposal: { id: 1n, documentReference: reference },
    document: { status: 'content-mismatch', retryable: false },
  })
  if (result.status === 'success') expect(JSON.stringify(result.document)).not.toContain('Impostor')
})

test('a recorded reference that is not a verifiable ipfs reference is reported', async () => {
  const state = makeReader()
  state.proposals.set(1n, record(1n, TREASURY_A, CREATOR_1, 'https://example.com/doc.json'))

  const result = await state.app.readPublishedProposal(1n)

  expect(result).toMatchObject({
    status: 'success',
    proposal: { id: 1n, documentReference: 'https://example.com/doc.json' },
    document: { status: 'invalid-reference', retryable: false },
  })
  expect(state.retrieval.calls).toEqual([])
})

test('a well-formed but unverifiable reference is distinct from a malformed one', async () => {
  const state = makeReader()
  // CIDv1 with the dag-cbor codec (0x71): valid shape, but not recomputable here.
  const unsupported = `ipfs://${cidV1(0x71, new Uint8Array(32))}`
  state.proposals.set(1n, record(1n, TREASURY_A, CREATOR_1, unsupported))
  state.content.set(unsupported.slice('ipfs://'.length), new TextEncoder().encode('{}'))

  expect(await state.app.readPublishedProposal(1n)).toMatchObject({
    status: 'success',
    document: { status: 'unverifiable-reference', retryable: false },
  })
})

test('a client without IPFS retrieval reports a non-retryable document failure', async () => {
  const state = makeReader()
  const reference = addDocument(state, 1n, TREASURY_A, CREATOR_1, { title: 'Club day', markdown: 'x' })
  const noIpfs = createApplication(undefined, state.rpc, {
    chainId: 31337,
    daoAddress: DAO,
    testUsdAddress: TEST_USD,
  })

  expect(await noIpfs.readPublishedProposal(1n)).toMatchObject({
    status: 'success',
    proposal: { id: 1n, documentReference: reference },
    document: { status: 'transport-unconfigured', retryable: false },
  })
})

test('oversized published documents are reported as invalid, not silently truncated', async () => {
  const state = makeReader()
  const big = new TextEncoder().encode(
    JSON.stringify({ version: 1, title: 'Big', markdown: 'a'.repeat(MAX_PROPOSAL_DOCUMENT_BYTES) })
  )
  state.proposals.set(1n, record(1n, TREASURY_A, CREATOR_1, publish(state.content, big)))

  expect(await state.app.readPublishedProposal(1n)).toMatchObject({
    document: { status: 'invalid-document', retryable: false },
  })
})

test('listing surfaces records that disappear mid-read instead of hiding them', async () => {
  const state = makeReader()
  addDocument(state, 1n, TREASURY_A, CREATOR_1, { title: 'One', markdown: 'x' })
  // An inconsistent node: the first count read says 3, later reads say 1,
  // so records 3 and 2 resolve to nothing.
  state.countReads([3n, 1n])

  const result = await state.app.listProposals()

  expect(result).toMatchObject({ status: 'success' })
  if (result.status !== 'success') return
  expect(result.proposals.map((p) => p.proposal.id)).toEqual([1n])
  expect(result.gaps).toEqual([3n, 2n])
})

test('listing reads records in bounded batches', async () => {
  const state = makeReader()
  for (let id = 1n; id <= 25n; id += 1n) {
    addDocument(state, id, TREASURY_A, CREATOR_1, { title: `P${id}`, markdown: 'x' })
  }
  let inFlight = 0
  let peak = 0
  const original = state.rpc.readContract!
  state.rpc.readContract = (async (request: { functionName: string }) => {
    if (request.functionName !== 'getProposal') return original(request as never)
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 1))
    inFlight -= 1
    return original(request as never)
  }) as typeof original

  const result = await state.app.listProposals()

  expect(result).toMatchObject({ status: 'success' })
  if (result.status === 'success') expect(result.proposals).toHaveLength(25)
  expect(peak).toBeLessThanOrEqual(10)
})

// Each case lists patterns that must not appear in the rendered HTML. Escaped
// text such as `&lt;img onerror=...&gt;` is inert, so only live markup counts.
test.each([
  ['event-handler attributes', '<img src=x onerror=alert(1)>\n\n<a href="/" onclick="x()">t</a>', [/<img/, /<a /, /<[^>]*\sonerror=/, /<[^>]*\sonclick=/]],
  ['inline SVG', '<svg onload=alert(1)><script>alert(2)</script></svg>', [/<svg/, /<script/]],
  ['entity-encoded schemes', '[a](jav&#x61;script:alert(1)) [b](&#106;avascript:alert(1)) [c](javascript&colon;alert(1))', [/href="javascript/i, /href="[^"]*&(?!amp;)/]],
  ['whitespace and data/vbscript schemes', '[a](java\tscript:alert(1)) [b](vbscript:x) [c](data:text/html;base64,PHNjcmlwdD4=)', [/href=/]],
  ['script and svg image sources', '![x](javascript:alert(1)) ![y](data:image/svg+xml,<svg onload=alert(1)>)', [/<img/]],
])('published view neutralizes %s', async (_name, markdown, forbidden) => {
  const state = makeReader()
  addDocument(state, 1n, TREASURY_A, CREATOR_1, { title: 'Evil', markdown })

  const result = await state.app.readPublishedProposal(1n)

  if (result.status !== 'success' || result.document.status !== 'available') throw new Error('expected document')
  for (const pattern of forbidden) expect(result.document.html).not.toMatch(pattern)
})

test('chain read failures are distinct from document failures', async () => {
  const down = makeReader({ rpcDown: true })
  expect(await down.app.listProposals()).toMatchObject({ status: 'rpc-unavailable' })
  expect(await down.app.readPublishedProposal(1n)).toMatchObject({ status: 'rpc-unavailable' })

  const unconfigured = createApplication(undefined, undefined, {
    chainId: 31337,
    daoAddress: null,
    testUsdAddress: null,
  })
  expect(await unconfigured.listProposals()).toMatchObject({ status: 'unconfigured' })
  expect(await unconfigured.readPublishedProposal(1n)).toMatchObject({ status: 'unconfigured' })
})
