import { expect, test, vi } from 'vitest'
import { createApplication } from './application'
import {
  type IpfsCredentials,
  type IpfsTransport,
  type IpfsUploadReceipt,
  type IpfsUploadRequest,
  IpfsTransportError,
  createPinataIpfsTransport,
  formatIpfsReference,
  isValidCid,
  parseIpfsReference,
} from './ipfs'

const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
const CID_V0 = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'
const OTHER_CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzda'

interface RecordedUpload {
  request: IpfsUploadRequest
  credentials: IpfsCredentials
}

function makeApp(pinImpl?: (request: IpfsUploadRequest) => Promise<IpfsUploadReceipt>) {
  const uploads: RecordedUpload[] = []
  const transport: IpfsTransport = {
    pin: vi.fn(async (request: IpfsUploadRequest, credentials: IpfsCredentials) => {
      uploads.push({ request, credentials })
      return pinImpl ? pinImpl(request) : { cid: CID, size: request.bytes.byteLength }
    }),
    retrieve: vi.fn(async () => new Uint8Array()),
  }
  const app = createApplication(undefined, undefined, undefined, { ipfs: transport })
  app.updateProposalDraft({ title: 'Club day', markdown: '# Agenda\n\nLunch.' })
  return { app, transport, uploads }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// ---------------------------------------------------------------------------
// Pinning the reviewed document
// ---------------------------------------------------------------------------

test('pinning uploads the exact reviewed bytes and binds the returned reference', async () => {
  const { app, transport, uploads } = makeApp()
  const expected = app.encodeProposalDraft()

  expect(app.readProposalPinState()).toEqual({ status: 'not-pinned' })

  const result = await app.pinProposalDraft({ token: 'proposer-jwt' })

  expect(result.status).toBe('pinned')
  if (result.status !== 'pinned') return
  expect(result.pin.cid).toBe(CID)
  expect(result.pin.reference).toBe(`ipfs://${CID}`)
  expect(result.pin.document).toEqual(expected.document)
  expect(result.pin.bytes).toEqual(expected.bytes)

  expect(uploads).toHaveLength(1)
  expect(uploads[0]!.request.bytes).toEqual(expected.bytes)
  expect(uploads[0]!.request.name).toBe('proposal-document.json')
  expect(uploads[0]!.request.contentType).toBe('application/json')
  expect(uploads[0]!.credentials.token).toBe('proposer-jwt')
  expect(transport.pin).toHaveBeenCalledOnce()

  const state = app.readProposalPinState()
  expect(state.status).toBe('pinned')
  if (state.status === 'pinned') expect(state.pin.reference).toBe(`ipfs://${CID}`)
})

test('pinning needs neither a wallet nor a chain and allocates no proposal ID', async () => {
  const { app } = makeApp()

  expect(app.readWalletAccount()).toEqual({ status: 'disconnected' })
  const result = await app.pinProposalDraft({ token: 'proposer-jwt' })

  expect(result.status).toBe('pinned')
  expect(app.readWalletAccount()).toEqual({ status: 'disconnected' })
  // The pinned result carries only the document reference, never a proposal ID.
  if (result.status === 'pinned') {
    expect(Object.keys(result.pin).sort()).toEqual(['bytes', 'cid', 'document', 'reference'])
  }
})

test('uploading and pinned are distinct states', async () => {
  const pending = deferred<IpfsUploadReceipt>()
  const { app } = makeApp(() => pending.promise)

  const attempt = app.pinProposalDraft({ token: 'proposer-jwt' })
  expect(app.readProposalPinState().status).toBe('uploading')

  pending.resolve({ cid: CID })
  const result = await attempt

  expect(result.status).toBe('pinned')
  expect(app.readProposalPinState().status).toBe('pinned')
})

// ---------------------------------------------------------------------------
// Failure, invalid results, and retry
// ---------------------------------------------------------------------------

test('a service failure is retryable and a later retry pins the same draft', async () => {
  const transport: IpfsTransport = {
    pin: vi
      .fn()
      .mockRejectedValueOnce(new Error('pinning service responded 500'))
      .mockResolvedValueOnce({ cid: CID }),
    retrieve: vi.fn(),
  }
  const app = createApplication(undefined, undefined, undefined, { ipfs: transport })
  app.updateProposalDraft({ title: 'Club day', markdown: 'Agenda' })

  const failed = await app.pinProposalDraft({ token: 'proposer-jwt' })
  expect(failed.status).toBe('upload-failed')
  if (failed.status === 'upload-failed') {
    expect(failed.retryable).toBe(true)
    expect(failed.message).toContain('500')
  }

  const state = app.readProposalPinState()
  expect(state.status).toBe('upload-failed')
  if (state.status === 'upload-failed') expect(state.retryable).toBe(true)

  const retried = await app.pinProposalDraft({ token: 'proposer-jwt' })
  expect(retried.status).toBe('pinned')
  expect(app.readProposalPinState().status).toBe('pinned')
  expect(transport.pin).toHaveBeenCalledTimes(2)
})

test('invalid or mismatched upload results never produce a pinned reference', async () => {
  for (const receipt of [
    { cid: '' },
    { cid: 'not-a-cid' },
    { cid: CID, size: 1 },
  ] as IpfsUploadReceipt[]) {
    const { app } = makeApp(async () => receipt)

    const result = await app.pinProposalDraft({ token: 'proposer-jwt' })

    expect(result.status).toBe('invalid-upload-result')
    if (result.status === 'invalid-upload-result') expect(result.retryable).toBe(true)
    expect(app.readProposalPinState().status).toBe('upload-failed')
  }
})

test('missing credentials or an incomplete draft do not call the transport', async () => {
  const { app, transport } = makeApp()

  const noToken = await app.pinProposalDraft({ token: '   ' })
  expect(noToken.status).toBe('credentials-required')

  app.updateProposalDraft({ title: '   ' })
  const noTitle = await app.pinProposalDraft({ token: 'proposer-jwt' })
  expect(noTitle.status).toBe('invalid-draft')

  app.updateProposalDraft({ title: 'Club day', markdown: '  ' })
  const noBody = await app.pinProposalDraft({ token: 'proposer-jwt' })
  expect(noBody.status).toBe('invalid-draft')

  expect(transport.pin).not.toHaveBeenCalled()
})

test('pinning is reported unavailable without a configured transport', async () => {
  const app = createApplication()
  app.updateProposalDraft({ title: 'Club day', markdown: 'Agenda' })

  const result = await app.pinProposalDraft({ token: 'proposer-jwt' })

  expect(result.status).toBe('ipfs-unavailable')
  expect(app.readProposalPinState()).toEqual({ status: 'not-pinned' })
})

// ---------------------------------------------------------------------------
// Draft edits versus prepared references
// ---------------------------------------------------------------------------

test('editing after pinning invalidates the prepared reference until re-pinned', async () => {
  const { app, uploads } = makeApp()
  const first = await app.pinProposalDraft({ token: 'proposer-jwt' })
  expect(first.status).toBe('pinned')

  app.updateProposalDraft({ markdown: '# Revised agenda\n\nDinner instead.' })
  const stale = app.readProposalPinState()
  expect(stale.status).toBe('draft-changed')
  if (stale.status === 'draft-changed') {
    expect(stale.previousReference).toBe(`ipfs://${CID}`)
  }

  const second = await app.pinProposalDraft({ token: 'proposer-jwt' })
  expect(second.status).toBe('pinned')
  expect(app.readProposalPinState().status).toBe('pinned')
  expect(uploads).toHaveLength(2)
  expect(uploads[1]!.request.bytes).toEqual(app.encodeProposalDraft().bytes)
  expect(uploads[1]!.request.bytes).not.toEqual(uploads[0]!.request.bytes)
})

test('a draft edit during upload is not silently bound to the old reference', async () => {
  const pending = deferred<IpfsUploadReceipt>()
  const { app } = makeApp(() => pending.promise)
  const originalBytes = app.encodeProposalDraft().bytes

  const attempt = app.pinProposalDraft({ token: 'proposer-jwt' })
  app.updateProposalDraft({ markdown: '# Changed while uploading' })
  pending.resolve({ cid: CID })

  const result = await attempt
  expect(result.status).toBe('draft-changed-during-upload')
  if (result.status !== 'draft-changed-during-upload') return

  // The returned pin describes only the bytes that were actually uploaded.
  expect(result.pin.bytes).toEqual(originalBytes)
  expect(result.pin.document.markdown).toBe('# Agenda\n\nLunch.')
  expect(result.pin.bytes).not.toEqual(app.encodeProposalDraft().bytes)

  const state = app.readProposalPinState()
  expect(state.status).toBe('draft-changed')

  // Re-pinning the current draft produces a reference for the new content.
  const repinned = await app.pinProposalDraft({ token: 'proposer-jwt' })
  expect(repinned.status).toBe('pinned')
  if (repinned.status === 'pinned') {
    expect(repinned.pin.bytes).toEqual(app.encodeProposalDraft().bytes)
  }
})

test('credentials are never retained in state or document content', async () => {
  const { app } = makeApp()
  const token = 'super-secret-proposer-jwt'

  await app.pinProposalDraft({ token })

  expect(JSON.stringify(app.readProposalPinState())).not.toContain(token)
  expect(JSON.stringify(app.readProposalDraft())).not.toContain(token)
  expect(new TextDecoder().decode(app.encodeProposalDraft().bytes)).not.toContain(token)
})

// ---------------------------------------------------------------------------
// Documented Pinata interaction (fetch is the only mocked boundary)
// ---------------------------------------------------------------------------

test('the Pinata transport posts the exact bytes with the proposer token', async () => {
  const bytes = new TextEncoder().encode('{"version":1,"title":"T","markdown":"# Hi"}')
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ IpfsHash: CID, PinSize: bytes.byteLength }), { status: 200 })
  )
  const transport = createPinataIpfsTransport({ fetch: fetchMock as unknown as typeof fetch })

  const receipt = await transport.pin(
    { bytes, name: 'proposal-document.json', contentType: 'application/json' },
    { token: 'proposer-jwt' }
  )

  expect(receipt).toEqual({ cid: CID, size: bytes.byteLength })
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://api.pinata.cloud/pinning/pinFileToIPFS')
  expect(init.method).toBe('POST')
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer proposer-jwt')

  const form = init.body as FormData
  const file = form.get('file') as File
  expect(file.name).toBe('proposal-document.json')
  expect(file.type).toBe('application/json')
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes)
})

test('the Pinata transport surfaces service failures and malformed responses', async () => {
  const failing = createPinataIpfsTransport({
    fetch: vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch,
  })
  await expect(
    failing.pin({ bytes: new Uint8Array([1]), name: 'a', contentType: 'application/json' }, { token: 't' })
  ).rejects.toMatchObject({ reason: 'upload-failed' })

  const badJson = createPinataIpfsTransport({
    fetch: vi.fn(async () => new Response('not json', { status: 200 })) as unknown as typeof fetch,
  })
  await expect(
    badJson.pin({ bytes: new Uint8Array([1]), name: 'a', contentType: 'application/json' }, { token: 't' })
  ).rejects.toMatchObject({ reason: 'invalid-response' })

  const missingCid = createPinataIpfsTransport({
    fetch: vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
  })
  await expect(
    missingCid.pin({ bytes: new Uint8Array([1]), name: 'a', contentType: 'application/json' }, { token: 't' })
  ).rejects.toMatchObject({ reason: 'invalid-response' })

  await expect(failing.pin).toBeInstanceOf(Function)
  expect(new IpfsTransportError('upload-failed', 'x').kind).toBe('ipfs-transport-error')
})

test('the transport retrieves bytes from a public gateway by CID', async () => {
  const payload = new TextEncoder().encode('{"version":1}')
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(payload, { status: 200 })
  )
  const transport = createPinataIpfsTransport({ fetch: fetchMock as unknown as typeof fetch })

  const bytes = await transport.retrieve(CID)

  expect(bytes).toEqual(payload)
  expect(String(fetchMock.mock.calls[0]![0])).toBe(`https://ipfs.io/ipfs/${CID}`)

  const missing = createPinataIpfsTransport({
    fetch: vi.fn(async () => new Response('not found', { status: 404 })) as unknown as typeof fetch,
  })
  await expect(missing.retrieve(CID)).rejects.toMatchObject({ reason: 'content-not-found' })
  const broken = createPinataIpfsTransport({
    fetch: vi.fn(async () => new Response('oops', { status: 502 })) as unknown as typeof fetch,
  })
  await expect(broken.retrieve(CID)).rejects.toMatchObject({ reason: 'retrieval-failed' })
  await expect(transport.retrieve('not-a-cid')).rejects.toMatchObject({
    reason: 'retrieval-failed',
  })
})

test('content identifiers and ipfs:// references are validated', () => {
  expect(isValidCid(CID)).toBe(true)
  expect(isValidCid(CID_V0)).toBe(true)
  expect(isValidCid('not-a-cid')).toBe(false)
  expect(isValidCid('')).toBe(false)

  expect(formatIpfsReference(CID)).toBe(`ipfs://${CID}`)
  expect(formatIpfsReference(OTHER_CID)).toBe(`ipfs://${OTHER_CID}`)
  expect(() => formatIpfsReference('nope')).toThrow(IpfsTransportError)

  expect(parseIpfsReference(`ipfs://${CID}`)).toBe(CID)
  expect(parseIpfsReference(`https://ipfs.io/ipfs/${CID}`)).toBeNull()
  expect(parseIpfsReference('ipfs://nope')).toBeNull()
})
