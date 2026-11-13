import { expect, test } from 'vitest'
import { createApplication } from './application'
import {
  decodeProposalDocument,
  encodeProposalDocument,
  ProposalDocumentError,
  renderProposalMarkdown,
} from './proposal'

// ---------------------------------------------------------------------------
// Draft editing and preview
// ---------------------------------------------------------------------------

test('a new draft is empty and previewable without a wallet or chain', () => {
  const app = createApplication()

  expect(app.readWalletAccount()).toEqual({ status: 'disconnected' })
  expect(app.readProposalDraft()).toEqual({ title: '', markdown: '' })

  const preview = app.previewProposalDraft()
  expect(preview.html).toBe('')
  expect(preview.document).toEqual({ version: 1, title: '', markdown: '' })
  expect(preview.encodedBytes).toBeGreaterThan(0)
})

test('meaningful Markdown formatting is rendered in the draft preview', () => {
  const app = createApplication()
  app.updateProposalDraft({
    title: 'Club hackathon',
    markdown: [
      '# Spring hackathon',
      '',
      'We need **500 TestUSD** for *venue and food*.',
      '',
      '- Venue rental',
      '- Mentors',
      '',
      '> Open to every club member.',
      '',
      'Use `npm install` before the workshop.',
      '',
      '[Event page](https://example.com/hackathon)',
    ].join('\n'),
  })

  const { html, draft } = app.previewProposalDraft()

  expect(draft.title).toBe('Club hackathon')
  expect(html).toContain('<h1>Spring hackathon</h1>')
  expect(html).toContain('<strong>500 TestUSD</strong>')
  expect(html).toContain('<em>venue and food</em>')
  expect(html).toContain('<ul>')
  expect(html).toContain('<li>Venue rental</li>')
  expect(html).toContain('<li>Mentors</li>')
  expect(html).toContain('<blockquote>')
  expect(html).toContain('<code>npm install</code>')
  expect(html).toContain(
    '<a href="https://example.com/hackathon" target="_blank" rel="noopener noreferrer nofollow">Event page</a>'
  )
})

test('draft revisions update the preview and stay editable before publication', () => {
  const app = createApplication()
  const seen: string[] = []
  app.onProposalDraftChanged((draft) => seen.push(draft.markdown))

  app.updateProposalDraft({ title: 'First title', markdown: 'First **draft**' })
  const first = app.previewProposalDraft()
  expect(first.html).toContain('<strong>draft</strong>')
  expect(first.document.title).toBe('First title')

  app.updateProposalDraft({ markdown: 'Second *revision* with more detail' })
  const second = app.previewProposalDraft()

  expect(second.html).toContain('<em>revision</em>')
  expect(second.html).not.toContain('<strong>draft</strong>')
  // A body revision must not silently reset the title.
  expect(second.document.title).toBe('First title')
  expect(app.readProposalDraft().markdown).toBe('Second *revision* with more detail')
  expect(seen).toEqual(['First **draft**', 'Second *revision* with more detail'])

  app.updateProposalDraft({ title: 'Revised title' })
  expect(app.previewProposalDraft().document.title).toBe('Revised title')
  expect(app.previewProposalDraft().document.markdown).toBe(
    'Second *revision* with more detail'
  )
})

test('preview HTML always comes from the shared safe-rendering policy', () => {
  const app = createApplication()
  const markdown = '**bold** <script>alert(1)</script>'
  app.updateProposalDraft({ title: 'Shared policy', markdown })

  expect(app.previewProposalDraft().html).toBe(renderProposalMarkdown(markdown))
})

// ---------------------------------------------------------------------------
// Untrusted Markdown safety
// ---------------------------------------------------------------------------

test('script-bearing and event-handler HTML cannot execute in the preview', () => {
  const app = createApplication()
  app.updateProposalDraft({
    title: 'Malicious draft',
    markdown: [
      'Intro <script>alert(document.cookie)</script>',
      '',
      '<img src=x onerror=alert(1)>',
      '',
      '<iframe src="https://evil.example"></iframe>',
      '',
      '<svg onload=alert(1)></svg>',
      '',
      '<a href="javascript:alert(1)">raw link</a>',
    ].join('\n'),
  })

  const { html } = app.previewProposalDraft()

  expect(html).not.toContain('<script')
  expect(html).not.toContain('<iframe')
  expect(html).not.toContain('<svg')
  // Event handlers and javascript: URLs may only survive as escaped text,
  // never inside a real tag or attribute.
  expect(html).not.toMatch(/<[^>]*onerror/)
  expect(html).not.toMatch(/<[^>]*onload/)
  expect(html).not.toMatch(/href="javascript:/)
  // The markup is still visible to the reviewer as inert text.
  expect(html).toContain('&lt;script&gt;')
})

test('HTML inside fenced code blocks is escaped rather than injected', () => {
  const app = createApplication()
  app.updateProposalDraft({
    title: 'Code sample',
    markdown: '```html\n<script>alert(1)</script>\n<b>not bold</b>\n```',
  })

  const { html } = app.previewProposalDraft()

  expect(html).toContain('<pre><code>')
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  expect(html).not.toContain('<script')
  expect(html).not.toContain('<b>not bold</b>')
})

test('unsafe link schemes are dropped instead of becoming clickable', () => {
  const app = createApplication()
  app.updateProposalDraft({
    title: 'Unsafe links',
    markdown: [
      '[js](javascript:alert(1))',
      '[mixed case](JaVaScRiPt:alert(1))',
      '[vbscript](vbscript:msgbox(1))',
      '[data html](data:text/html;base64,PHNjcmlwdD4=)',
      '[entity](javascript&colon;alert(1))',
      '[protocol relative](//evil.example)',
    ].join('\n\n'),
  })

  const { html } = app.previewProposalDraft()

  expect(html).not.toContain('<a ')
  expect(html).not.toContain('href=')
  expect(html).not.toMatch(/javascript:/i)
  expect(html).not.toContain('vbscript:')
  expect(html).not.toContain('data:text/html')
  expect(html).not.toContain('//evil.example')
  // Link text remains readable for the reviewer.
  expect(html).toContain('js')
  expect(html).toContain('protocol relative')
})

test('unsafe image sources are dropped while safe images remain', () => {
  const app = createApplication()
  app.updateProposalDraft({
    title: 'Images',
    markdown: [
      '![tracking](javascript:alert(1))',
      '![svg](data:image/svg+xml;base64,AAAA)',
      '![venue](https://example.com/venue.png)',
    ].join('\n\n'),
  })

  const { html } = app.previewProposalDraft()

  expect(html).not.toContain('javascript:')
  expect(html).not.toContain('data:image/svg+xml')
  expect(html).toContain('<img src="https://example.com/venue.png" alt="venue" loading="lazy" />')
})

test('safe link destinations keep working and quotes cannot break attributes', () => {
  const app = createApplication()
  app.updateProposalDraft({
    title: 'Links',
    markdown: [
      '[site](https://example.com "a \\" onmouseover=\\"alert(1)")',
      '[mail](mailto:club@example.com)',
      '[relative](/treasuries)',
      '[anchor](#budget)',
    ].join('\n\n'),
  })

  const { html } = app.previewProposalDraft()

  // The injected quote is escaped, so onmouseover stays inside the title text.
  expect(html).not.toContain('" onmouseover=')
  expect(html).toContain('&quot;')
  expect(html).toContain('href="mailto:club@example.com"')
  expect(html).toContain('href="/treasuries"')
  expect(html).toContain('href="#budget"')
  expect(html).toContain('rel="noopener noreferrer nofollow"')
})

// ---------------------------------------------------------------------------
// Versioned document representation and exact encoding
// ---------------------------------------------------------------------------

test('the encoded document is deterministic canonical JSON with only public fields', () => {
  const app = createApplication()
  app.updateProposalDraft({ title: 'Club day', markdown: '# Agenda\n\nLunch.' })

  const { document, bytes } = app.encodeProposalDraft()

  expect(Object.keys(document)).toEqual(['version', 'title', 'markdown'])
  expect(new TextDecoder().decode(bytes)).toBe(
    '{"version":1,"title":"Club day","markdown":"# Agenda\\n\\nLunch."}'
  )
  expect(app.previewProposalDraft().encodedBytes).toBe(bytes.byteLength)
  expect(decodeProposalDocument(bytes)).toEqual(document)
})

test('editing a draft changes the exact bytes that publication would pin', () => {
  const app = createApplication()
  app.updateProposalDraft({ title: 'Club day', markdown: 'First version' })
  const first = app.encodeProposalDraft()

  app.updateProposalDraft({ markdown: 'Second version' })
  const second = app.encodeProposalDraft()

  expect(new TextDecoder().decode(second.bytes)).not.toBe(
    new TextDecoder().decode(first.bytes)
  )
  expect(decodeProposalDocument(second.bytes).markdown).toBe('Second version')
})

test('non-ASCII proposal content is encoded as exact UTF-8 bytes', () => {
  const app = createApplication()
  app.updateProposalDraft({ title: 'Café meetup ☕', markdown: 'Résumé — naïve' })

  const { bytes, document } = app.encodeProposalDraft()

  expect(bytes).toEqual(encodeProposalDocument(document))
  expect(decodeProposalDocument(bytes).title).toBe('Café meetup ☕')
  expect(decodeProposalDocument(bytes).markdown).toBe('Résumé — naïve')
})

test('document decoding rejects unsupported versions and malformed content', () => {
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

  const cases: Array<[unknown, ProposalDocumentError['reason']]> = [
    [{ version: 2, title: 'T', markdown: '' }, 'unsupported-version'],
    [{ version: 1, title: 'T' }, 'invalid-schema'],
    [{ version: 1, title: 'T', markdown: '', credentials: 'secret' }, 'invalid-schema'],
    [{ version: 1, title: '   ', markdown: '' }, 'invalid-schema'],
    [{ version: 1, title: 'T', markdown: 42 }, 'invalid-schema'],
    [['version', 1], 'invalid-schema'],
  ]

  for (const [value, reason] of cases) {
    let error: unknown
    try {
      decodeProposalDocument(encode(value))
    } catch (err) {
      error = err
    }
    expect(error).toBeInstanceOf(ProposalDocumentError)
    expect((error as ProposalDocumentError).reason).toBe(reason)
  }

  expect(() => decodeProposalDocument(new TextEncoder().encode('not json'))).toThrow(
    ProposalDocumentError
  )
  expect(() => decodeProposalDocument(new Uint8Array([0xff, 0xfe, 0x00, 0x41]))).toThrow(
    'not valid UTF-8'
  )
})
