/**
 * Azure DevOps rich fields nest <img> inside <strong>/<p>/<div>.
 * TipTap keeps marks + inline images when <img> is a sibling of marked text
 * inside the same <p> (not wrapped by the mark).
 *
 * Example ADO:
 *   <p><strong>Шаги&nbsp;<img src="…"></strong></p>
 * Becomes:
 *   <p><strong>Шаги </strong><img src="…"></p>
 */
export function normalizeAdoHtmlForEditor(html: string): string {
  const raw = (html || '').trim()
  if (!raw) return ''

  if (typeof DOMParser !== 'undefined') {
    return normalizeWithDom(raw)
  }
  return normalizeWithRegex(raw)
}

const INLINE_WRAP = new Set(['b', 'strong', 'i', 'em', 'u', 'span', 'a', 'font'])

function normalizeWithDom(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="ado-root">${html}</div>`, 'text/html')
  const root = doc.getElementById('ado-root')
  if (!root) return normalizeWithRegex(html)

  const out: string[] = []
  let loose = ''

  const flushLoose = () => {
    const cleaned = loose.replace(/\u00a0/g, ' ').trim()
    if (!cleaned) {
      loose = ''
      return
    }
    out.push(`<p>${loose.replace(/\u00a0/g, ' ').trim()}</p>`)
    loose = ''
  }

  const pushBlock = (el: HTMLElement) => {
    const tag = el.tagName.toLowerCase()
    if (tag === 'ul' || tag === 'ol') {
      out.push(sanitizeList(el))
      return
    }
    if (tag === 'p' || tag === 'div' || tag === 'td' || tag === 'th') {
      const inner = serializeFlowChildren(el)
      if (inner.trim()) out.push(`<p>${inner}</p>`)
      return
    }
    // Treat anything else as inline flow contribution.
    loose += serializeFlowChildren(el)
  }

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = (child.textContent || '').replace(/\u00a0/g, ' ')
      if (t.trim()) loose += escapeText(t)
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as HTMLElement
    const tag = el.tagName.toLowerCase()

    if (tag === 'p' || tag === 'div' || tag === 'ul' || tag === 'ol' || tag === 'table') {
      flushLoose()
      if (tag === 'table') {
        for (const cell of Array.from(el.querySelectorAll('td, th'))) {
          pushBlock(cell as HTMLElement)
        }
        continue
      }
      pushBlock(el)
      continue
    }

    // Loose <strong>/<img>/<br> at root — collect into one paragraph.
    loose += serializeFlowChildren(
      (() => {
        const wrap = doc.createElement('div')
        wrap.appendChild(el.cloneNode(true))
        return wrap
      })(),
    )
  }
  flushLoose()

  return out.join('') || normalizeWithRegex(html)
}

/** Serialize inline flow: marked text, <br>, <img> in reading order. */
function serializeFlowChildren(parent: Node): string {
  let html = ''
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      html += escapeText((child.textContent || '').replace(/\u00a0/g, ' '))
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as HTMLElement
    const tag = el.tagName.toLowerCase()

    if (tag === 'img') {
      html += serializeImage(el)
      continue
    }
    if (tag === 'br') {
      html += '<br>'
      continue
    }
    if (tag === 'p' || tag === 'div') {
      const inner = serializeFlowChildren(el)
      html += inner ? `${inner}<br>` : '<br>'
      continue
    }
    if (INLINE_WRAP.has(tag)) {
      if (el.querySelector('img')) {
        html += serializeMarkSplitAroundImages(el)
      } else {
        html += serializeMark(el)
      }
      continue
    }
    html += serializeFlowChildren(el)
  }
  return html.replace(/(?:<br>\s*)+$/g, '').trim()
}

function serializeMark(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  if (tag === 'span' || tag === 'font') {
    return serializeFlowChildren(el)
  }
  if (tag === 'a') {
    const href = el.getAttribute('href') || ''
    return `<a href="${escapeAttr(href)}">${serializeFlowChildren(el)}</a>`
  }
  const outTag = tag === 'b' ? 'strong' : tag === 'i' ? 'em' : tag
  const inner = serializeFlowChildren(el)
  return inner ? `<${outTag}>${inner}</${outTag}>` : ''
}

/**
 * <strong>text<img>more</strong> → <strong>text</strong><img><strong>more</strong>
 */
function serializeMarkSplitAroundImages(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  const outTag =
    tag === 'b' ? 'strong' : tag === 'i' ? 'em' : tag === 'span' || tag === 'font' ? '' : tag
  let html = ''
  let buf = ''

  const flushBuf = () => {
    const cleaned = buf.replace(/\u00a0/g, ' ')
    if (!cleaned.trim()) {
      buf = ''
      return
    }
    if (outTag === 'a') {
      const href = el.getAttribute('href') || ''
      html += `<a href="${escapeAttr(href)}">${cleaned}</a>`
    } else if (outTag) {
      html += `<${outTag}>${cleaned}</${outTag}>`
    } else {
      html += cleaned
    }
    buf = ''
  }

  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      buf += escapeText((child.textContent || '').replace(/\u00a0/g, ' '))
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const childEl = child as HTMLElement
    const childTag = childEl.tagName.toLowerCase()
    if (childTag === 'img') {
      flushBuf()
      html += serializeImage(childEl)
      continue
    }
    if (childTag === 'br') {
      buf += '<br>'
      continue
    }
    if (INLINE_WRAP.has(childTag)) {
      if (childEl.querySelector('img')) {
        flushBuf()
        html += serializeMarkSplitAroundImages(childEl)
      } else {
        buf += serializeMark(childEl)
      }
      continue
    }
    buf += serializeFlowChildren(childEl)
  }
  flushBuf()
  return html
}

function serializeImage(el: HTMLElement): string {
  const src = el.getAttribute('src')?.trim()
  if (!src) return ''
  const alt = el.getAttribute('alt') || ''
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`
}

function sanitizeList(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  const items = Array.from(el.children)
    .filter((c) => c.tagName.toLowerCase() === 'li')
    .map((li) => `<li>${serializeFlowChildren(li)}</li>`)
    .join('')
  return `<${tag}>${items}</${tag}>`
}

function escapeText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** Regex fallback (no DOM) — preserves marks and keeps img inline in the paragraph. */
function normalizeWithRegex(html: string): string {
  let h = html.replace(/\r\n/g, '\n')

  h = h.replace(
    /<(strong|b|em|i|u|span|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_m, tag: string, attrs: string, inner: string) => {
      const outTag = tag === 'b' ? 'strong' : tag === 'i' ? 'em' : tag
      if (!/<img\b/i.test(inner)) {
        if (outTag === 'span') return inner
        return `<${outTag}${attrs}>${inner}</${outTag}>`
      }
      const parts = inner.split(/(<img\b[^>]*>)/i)
      return parts
        .map((part) => {
          if (/^<img\b/i.test(part)) return part
          const text = part.replace(/&nbsp;/gi, ' ').trim()
          if (!text) return ''
          if (outTag === 'span') return part.replace(/&nbsp;/gi, ' ')
          return `<${outTag}${attrs}>${part.replace(/&nbsp;/gi, ' ')}</${outTag}>`
        })
        .join('')
    },
  )

  h = h
    .replace(/&nbsp;/gi, ' ')
    .replace(/<\/?font\b[^>]*>/gi, '')
    .replace(/<\/?span\b[^>]*>/gi, '')
    .replace(/<div\b[^>]*>/gi, '<p>')
    .replace(/<\/div>/gi, '</p>')

  return h
}
