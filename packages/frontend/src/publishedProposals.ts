import { IpfsTransportError, parseIpfsReference, type IpfsTransport } from './ipfs.js'
import { verifyContentAddress } from './ipfsContent.js'
import { decodeProposalDocument, ProposalDocumentError, renderProposalMarkdown } from './proposal.js'

// ---------------------------------------------------------------------------
// Published proposal document retrieval
// ---------------------------------------------------------------------------
//
// The on-chain record is the source of truth; the document is looked up from
// the recorded reference. Retrieval is wallet-free and the gateway is not
// trusted: bytes must hash to the recorded CID before they are parsed, and
// only a schema-valid document is rendered, with the shared Markdown policy.
// A failure here describes the document only; it never alters the record.

export type PublishedDocumentFailure =
  /** The recorded reference is not a well-formed ipfs:// reference. */
  | 'invalid-reference'
  /** Well-formed, but uses a codec/hash/size this client cannot content-verify. */
  | 'unverifiable-reference'
  /** This client has no IPFS retrieval configured; retrying cannot help. */
  | 'transport-unconfigured'
  /** The gateway answered that no content exists for the CID. */
  | 'unavailable'
  /** The gateway could not be reached or answered with an error. */
  | 'transport-failure'
  /** Retrieved bytes do not hash to the recorded CID. */
  | 'content-mismatch'
  /** Verified bytes are not a valid version-1 proposal document. */
  | 'invalid-document'

export type PublishedDocumentState =
  | {
      status: 'available'
      cid: string
      title: string
      markdown: string
      /** Sanitized HTML from the shared Markdown rendering policy. */
      html: string
    }
  | {
      status: PublishedDocumentFailure
      message: string
      /** True when trying again could succeed without any on-chain change. */
      retryable: boolean
    }

function failure(
  status: PublishedDocumentFailure,
  message: string,
  retryable: boolean
): PublishedDocumentState {
  return { status, message, retryable }
}

export async function readPublishedDocument(
  ipfs: IpfsTransport | null,
  reference: string
): Promise<PublishedDocumentState> {
  const cid = parseIpfsReference(reference)
  if (cid === null) {
    return failure(
      'invalid-reference',
      'The recorded document reference is not a valid ipfs:// content reference.',
      false
    )
  }
  if (!ipfs) {
    return failure(
      'transport-unconfigured',
      'This client has no IPFS retrieval configured, so the document could not be fetched.',
      false
    )
  }

  let bytes: Uint8Array
  try {
    bytes = await ipfs.retrieve(cid)
  } catch (error) {
    if (error instanceof IpfsTransportError && error.reason === 'content-not-found') {
      return failure(
        'unavailable',
        'The recorded document is not available from IPFS right now. It may not be pinned.',
        true
      )
    }
    return failure(
      'transport-failure',
      `The document could not be retrieved: ${error instanceof Error ? error.message : String(error)}`,
      true
    )
  }

  const verification = await verifyContentAddress(cid, bytes)
  if (verification.status === 'mismatch') {
    return failure(
      'content-mismatch',
      'The retrieved content does not match the recorded document reference and was discarded.',
      false
    )
  }
  if (verification.status === 'unverifiable') {
    return failure(
      'unverifiable-reference',
      'The recorded document reference uses an identifier format or size this client cannot verify.',
      false
    )
  }

  try {
    const document = decodeProposalDocument(bytes)
    return {
      status: 'available',
      cid,
      title: document.title,
      markdown: document.markdown,
      html: renderProposalMarkdown(document.markdown),
    }
  } catch (error) {
    if (error instanceof ProposalDocumentError) {
      return failure('invalid-document', `The published document is invalid: ${error.message}`, false)
    }
    throw error
  }
}
