/** Common HTML named entities (entities not listed fall through to numeric / unchanged). */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: '\u00A0',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  laquo: '\u00AB',
  raquo: '\u00BB',
  ldquo: '\u201C',
  rdquo: '\u201D',
  lsquo: '\u2018',
  rsquo: '\u2019',
  copy: '\u00A9',
  reg: '\u00AE',
  trade: '\u2122',
  times: '\u00D7',
  divide: '\u00F7',
  bull: '\u2022',
  middot: '\u00B7',
  deg: '\u00B0',
  euro: '\u20AC',
}

function decodeEntity(entity: string): string | null {
  if (!entity) return null
  if (entity[0] === '#') {
    const code =
      entity[1]?.toLowerCase() === 'x'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10)
    if (!Number.isFinite(code) || code < 0) return null
    try {
      return String.fromCodePoint(code)
    } catch {
      return null
    }
  }
  return NAMED_ENTITIES[entity.toLowerCase()] ?? null
}

/**
 * Decode HTML entities including repeated/double encoding (&amp;quot; → ").
 * Leaves unknown entities intact.
 */
export function decodeHtmlEntities(input: string): string {
  let value = input
  for (let pass = 0; pass < 6; pass += 1) {
    const next = value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
      return decodeEntity(entity) ?? match
    })
    if (next === value) break
    value = next
  }
  return value
}

/** Strip HTML tags and decode entities for plain-text editors. */
export function htmlToPlainText(html: string): string {
  if (!html) return ''
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<\/\s*div\s*>/gi, '\n')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return decodeHtmlEntities(withBreaks)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Keep existing <img> tags when the user edits description as plain text. */
export function mergePlainTextIntoDescription(originalHtml: string, plainText: string): string {
  const images = originalHtml.match(/<img\b[^>]*>/gi) ?? []
  const body = escapeHtml(plainText).replace(/\r\n/g, '\n').replace(/\n/g, '<br />')
  if (!images.length) return body
  return `<div>${body}</div>${images.map((img) => `<p>${img}</p>`).join('')}`
}

export function appendImageToDescription(originalHtml: string, url: string, alt: string) {
  const img = `<p><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" /></p>`
  return `${originalHtml || ''}${img}`
}

/** Attachment URLs already embedded in description HTML. */
export function descriptionImageUrls(html: string) {
  const urls = new Set<string>()
  const regex = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html))) {
    const src = decodeHtmlEntities(match[1]?.trim() || '')
    if (src) urls.add(src)
  }
  return urls
}

/** True when two media URLs refer to the same attachment (GUID / exact / containment). */
export function mediaUrlsMatch(a: string, b: string) {
  const left = decodeHtmlEntities(a.trim())
  const right = decodeHtmlEntities(b.trim())
  if (!left || !right) return false
  if (left === right) return true
  const guid =
    /\/attachments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  const leftGuid = guid.exec(left)?.[1]?.toLowerCase()
  const rightGuid = guid.exec(right)?.[1]?.toLowerCase()
  if (leftGuid && rightGuid && leftGuid === rightGuid) return true
  return left.includes(right) || right.includes(left)
}

/** Drop <img> tags (and empty wrapping <p>) that match the given URL / attachment id. */
export function removeImageFromDescription(html: string, urlOrId: string): string {
  if (!html || !urlOrId.trim()) return html
  const next = html.replace(/<p>\s*(<img\b[^>]*>)\s*<\/p>|<img\b[^>]*>/gi, (chunk, wrappedImg?: string) => {
    const tag = wrappedImg || chunk
    const src = /src=["']([^"']+)["']/i.exec(tag)?.[1]
    if (!src) return chunk
    return mediaUrlsMatch(decodeHtmlEntities(src), urlOrId) ? '' : chunk
  })
  return next.replace(/(<p>\s*<\/p>)+/gi, '').trim()
}

