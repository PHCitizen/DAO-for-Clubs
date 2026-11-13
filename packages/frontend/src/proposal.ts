import { Marked, type RendererObject } from 'marked'

// ---------------------------------------------------------------------------
// Proposal document format (version 1)
// ---------------------------------------------------------------------------
//
// A proposal document is the public description of an event and its funding
// request. It deliberately contains only public prose: no pinning credentials,
// wallet signatures, attendee credentials, or later attendance data.
//
// Exact encoding consumed by the publication ticket (03.02):
//   UTF-8 bytes of JSON.stringify({ version, title, markdown })
// with the keys written in that fixed order and no extra fields. Encoding is
// therefore deterministic for a given draft, so the pinned bytes are exactly
// the bytes the organizer reviewed.

export const PROPOSAL_DOCUMENT_VERSION = 1 as const
export const PROPOSAL_DOCUMENT_ENCODING = 'utf-8-json' as const
export const MAX_PROPOSAL_TITLE_LENGTH = 200

export interface ProposalDocument {
  version: typeof PROPOSAL_DOCUMENT_VERSION
  /** Short human-readable event title. */
  title: string
  /** Markdown source describing the event and funding request. */
  markdown: string
}

export class ProposalDocumentError extends Error {
  readonly kind = 'proposal-document-error' as const
  constructor(
    readonly reason: 'invalid-encoding' | 'invalid-schema' | 'unsupported-version',
    message: string
  ) {
    super(message)
    this.name = 'ProposalDocumentError'
  }
}

/** Serializes a document to its canonical JSON text. */
export function proposalDocumentToJson(document: ProposalDocument): string {
  // Literal key order is part of the format; do not spread arbitrary input.
  return JSON.stringify({
    version: PROPOSAL_DOCUMENT_VERSION,
    title: document.title,
    markdown: document.markdown,
  })
}

/** Encodes a document as the exact UTF-8 bytes that will be pinned. */
export function encodeProposalDocument(document: ProposalDocument): Uint8Array {
  return new TextEncoder().encode(proposalDocumentToJson(document))
}

/**
 * Decodes and validates bytes previously produced by `encodeProposalDocument`.
 * Unknown versions and extra/missing fields are rejected so a reader never
 * mistakes a different artifact for a valid proposal document.
 */
export function decodeProposalDocument(bytes: Uint8Array): ProposalDocument {
  let json: string
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new ProposalDocumentError('invalid-encoding', 'Proposal document is not valid UTF-8.')
  }

  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new ProposalDocumentError('invalid-encoding', 'Proposal document is not valid JSON.')
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProposalDocumentError('invalid-schema', 'Proposal document must be a JSON object.')
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.join(',') !== 'markdown,title,version') {
    throw new ProposalDocumentError(
      'invalid-schema',
      'Proposal document must contain exactly version, title, and markdown.'
    )
  }
  if (record.version !== PROPOSAL_DOCUMENT_VERSION) {
    throw new ProposalDocumentError(
      'unsupported-version',
      `Unsupported proposal document version: ${String(record.version)}.`
    )
  }
  if (typeof record.title !== 'string' || record.title.trim().length === 0) {
    throw new ProposalDocumentError('invalid-schema', 'Proposal document title must be non-empty.')
  }
  if (record.title.length > MAX_PROPOSAL_TITLE_LENGTH) {
    throw new ProposalDocumentError(
      'invalid-schema',
      `Proposal document title must be at most ${MAX_PROPOSAL_TITLE_LENGTH} characters.`
    )
  }
  if (typeof record.markdown !== 'string') {
    throw new ProposalDocumentError('invalid-schema', 'Proposal document markdown must be a string.')
  }

  return {
    version: PROPOSAL_DOCUMENT_VERSION,
    title: record.title,
    markdown: record.markdown,
  }
}

// ---------------------------------------------------------------------------
// Safe Markdown rendering policy
// ---------------------------------------------------------------------------
//
// Shared by the draft preview and by published-document reading. Untrusted
// Markdown must never execute application code:
//   * Raw HTML is escaped and shown as text instead of being injected.
//   * Links and images only keep explicitly safe URL schemes.
//   * Every dynamic attribute is HTML-escaped, including titles and alt text.

const SAFE_LINK_SCHEMES = new Set(['http', 'https', 'mailto'])
const SAFE_IMAGE_SCHEMES = new Set(['http', 'https'])

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function schemeOf(value: string): string | null {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(value)
  return match ? match[1].toLowerCase() : null
}

/**
 * Returns the URL when it is safe to emit as an attribute, otherwise null.
 * Absolute URLs must use an allowlisted scheme; relative URLs and fragments
 * are allowed. Control characters and whitespace are rejected so a scheme
 * cannot be disguised with characters browsers ignore.
 */
export function sanitizeUrl(rawUrl: string, allowedSchemes: Set<string>): string | null {
  const url = rawUrl.trim()
  if (url.length === 0) return null
  if (/[\u0000-\u0020]/.test(url)) return null
  if (url.startsWith('//')) return null

  // Reject entity-obfuscated schemes such as `javascript&colon;...` before the
  // first path/query/fragment delimiter; a browser must not be able to decode
  // a different scheme than the one validated here.
  const schemeRegion = url.split(/[/?#]/, 1)[0] ?? url
  if (/&(?:[A-Za-z][A-Za-z0-9]+|#\d+|#x[0-9A-Fa-f]+);/.test(schemeRegion)) return null

  const scheme = schemeOf(url)
  if (scheme === null) return url // relative path, query, or #fragment
  return allowedSchemes.has(scheme) ? url : null
}

const renderer: RendererObject = {
  // Raw HTML (including <script>, event handlers, iframes) becomes inert text.
  html({ text }) {
    return escapeHtml(text)
  },

  // Fenced/indented code is escaped; no language class is emitted.
  code({ text }) {
    return `<pre><code>${escapeHtml(text.replace(/\n$/, ''))}\n</code></pre>\n`
  },

  link({ href, title, tokens }) {
    const body = this.parser.parseInline(tokens)
    const url = sanitizeUrl(href, SAFE_LINK_SCHEMES)
    if (url === null) {
      // Unsafe destination: keep the readable text, drop the link entirely.
      return body
    }
    const isExternal = schemeOf(url) !== null
    const attributes = isExternal
      ? ' target="_blank" rel="noopener noreferrer nofollow"'
      : ''
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : ''
    return `<a href="${escapeHtml(url)}"${titleAttribute}${attributes}>${body}</a>`
  },

  image({ href, title, text }) {
    const url = sanitizeUrl(href, SAFE_IMAGE_SCHEMES)
    if (url === null) return escapeHtml(text)
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : ''
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(text)}"${titleAttribute} loading="lazy" />`
  },
}

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer,
})

/**
 * Renders untrusted Markdown to sanitized HTML. This is the single rendering
 * policy used for draft previews and, later, published proposal documents.
 */
export function renderProposalMarkdown(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string
}
