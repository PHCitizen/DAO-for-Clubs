// ---------------------------------------------------------------------------
// Reusable IPFS transport seam
// ---------------------------------------------------------------------------
//
// Small transport interface for content-addressed upload and retrieval. It is
// deliberately agnostic about what is being pinned: proposal documents now,
// attendance publications later. No attendance cryptography, proposal schema,
// or credentials storage lives here.
//
// Supported IPFS interaction (documented for proposers):
//   * Upload: Pinata `POST {apiUrl}/pinning/pinFileToIPFS`, multipart form with
//     a single `file` part, authorized with the proposer's own Pinata JWT as
//     `Authorization: Bearer <token>`. The service answers with `IpfsHash`.
//   * Retrieval: `GET {gatewayUrl}/ipfs/{cid}` on a public IPFS gateway.
//
// Credentials are supplied per call by the proposer. They are never written to
// documents, chain data, logs, committed configuration, or frontend bundles.

export interface IpfsCredentials {
  /** Proposer-provided pinning token (Pinata JWT). */
  token: string
}

export interface IpfsUploadRequest {
  /** Exact bytes to pin. */
  bytes: Uint8Array
  /** File name reported to the pinning service. */
  name: string
  /** MIME type of the bytes. */
  contentType: string
}

export interface IpfsUploadReceipt {
  /** Content identifier returned by the pinning service. */
  cid: string
  /** Byte size reported by the service, when it provides one. */
  size?: number
}

export interface IpfsTransport {
  pin(request: IpfsUploadRequest, credentials: IpfsCredentials): Promise<IpfsUploadReceipt>
  retrieve(cid: string): Promise<Uint8Array>
}

export class IpfsTransportError extends Error {
  readonly kind = 'ipfs-transport-error' as const
  constructor(
    readonly reason: 'upload-failed' | 'invalid-response' | 'retrieval-failed' | 'content-not-found',
    message: string
  ) {
    super(message)
    this.name = 'IpfsTransportError'
  }
}

// ---------------------------------------------------------------------------
// Content identifiers and references
// ---------------------------------------------------------------------------

const CID_V0_PATTERN = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/
const CID_V1_BASE32_PATTERN = /^b[a-z2-7]{20,}$/

/** Accepts CIDv0 (Qm…) and CIDv1 base32 (bafy…/b…) identifiers. */
export function isValidCid(value: string): boolean {
  return CID_V0_PATTERN.test(value) || CID_V1_BASE32_PATTERN.test(value)
}

/** Formats a validated CID as the `ipfs://` reference recorded for a document. */
export function formatIpfsReference(cid: string): string {
  if (!isValidCid(cid)) {
    throw new IpfsTransportError('invalid-response', `Invalid IPFS content identifier: ${cid}`)
  }
  return `ipfs://${cid}`
}

/** Extracts the CID from an `ipfs://` reference, or null when malformed. */
export function parseIpfsReference(reference: string): string | null {
  if (!reference.startsWith('ipfs://')) return null
  const cid = reference.slice('ipfs://'.length)
  return isValidCid(cid) ? cid : null
}

// ---------------------------------------------------------------------------
// Pinata transport
// ---------------------------------------------------------------------------

export interface PinataTransportOptions {
  /** Injected for controlled tests; defaults to the global fetch. */
  fetch?: typeof globalThis.fetch
  /** Defaults to https://api.pinata.cloud */
  apiUrl?: string
  /** Public gateway used for retrieval; defaults to https://ipfs.io */
  gatewayUrl?: string
}

export function createPinataIpfsTransport(options: PinataTransportOptions = {}): IpfsTransport {
  const apiUrl = (options.apiUrl ?? 'https://api.pinata.cloud').replace(/\/$/, '')
  const gatewayUrl = (options.gatewayUrl ?? 'https://ipfs.io').replace(/\/$/, '')
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)

  return {
    async pin(request, credentials) {
      const form = new FormData()
      form.append(
        'file',
        new Blob([request.bytes as BlobPart], { type: request.contentType }),
        request.name
      )

      let response: Response
      try {
        response = await fetchImpl(`${apiUrl}/pinning/pinFileToIPFS`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${credentials.token}` },
          body: form,
        })
      } catch (error) {
        throw new IpfsTransportError(
          'upload-failed',
          `The pinning service could not be reached: ${error instanceof Error ? error.message : String(error)}`
        )
      }

      if (!response.ok) {
        throw new IpfsTransportError(
          'upload-failed',
          `The pinning service rejected the upload with status ${response.status}.`
        )
      }

      let body: unknown
      try {
        body = await response.json()
      } catch {
        throw new IpfsTransportError(
          'invalid-response',
          'The pinning service returned a response that was not JSON.'
        )
      }

      const cid = (body as { IpfsHash?: unknown }).IpfsHash
      if (typeof cid !== 'string' || !isValidCid(cid)) {
        throw new IpfsTransportError(
          'invalid-response',
          'The pinning service response did not include a valid IpfsHash content identifier.'
        )
      }

      const size = (body as { PinSize?: unknown }).PinSize
      return { cid, ...(typeof size === 'number' ? { size } : {}) }
    },

    async retrieve(cid) {
      if (!isValidCid(cid)) {
        throw new IpfsTransportError('retrieval-failed', `Invalid IPFS content identifier: ${cid}`)
      }

      let response: Response
      try {
        response = await fetchImpl(`${gatewayUrl}/ipfs/${cid}`)
      } catch (error) {
        throw new IpfsTransportError(
          'retrieval-failed',
          `The IPFS gateway could not be reached: ${error instanceof Error ? error.message : String(error)}`
        )
      }
      if (response.status === 404 || response.status === 410) {
        throw new IpfsTransportError(
          'content-not-found',
          'The IPFS gateway does not have content for that identifier.'
        )
      }
      if (!response.ok) {
        throw new IpfsTransportError(
          'retrieval-failed',
          `The IPFS gateway responded with status ${response.status}.`
        )
      }
      return new Uint8Array(await response.arrayBuffer())
    },
  }
}
