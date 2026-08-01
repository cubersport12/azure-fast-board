import { requireAzureApi } from '@/lib/azure-api'

const cache = new Map<string, Promise<string>>()

export function isRemoteMediaUrl(url: string) {
  return /^(https?:)?\/\//i.test(url) || url.startsWith('/')
}

export function toDataUrl(mimeType: string, dataBase64: string) {
  return `data:${mimeType};base64,${dataBase64}`
}

/** Resolve Azure attachment / image URLs through authenticated main-process fetch. */
export function resolveMediaUrl(url: string): Promise<string> {
  const trimmed = url.trim()
  if (!trimmed) return Promise.reject(new Error('Empty media URL'))
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return Promise.resolve(trimmed)

  const cached = cache.get(trimmed)
  if (cached) return cached

  const promise = requireAzureApi()
    .fetchMedia(trimmed)
    .then((media) => toDataUrl(media.mimeType, media.dataBase64))
    .catch((error) => {
      cache.delete(trimmed)
      throw error
    })

  cache.set(trimmed, promise)
  return promise
}

export function extractHtmlImageSrcs(html: string) {
  const urls = new Set<string>()
  const regex = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html))) {
    const raw = match[1]?.trim()
    if (!raw) continue
    // Azure HTML often stores &amp; inside attribute values.
    urls.add(raw.replace(/&amp;/gi, '&'))
  }
  return [...urls]
}

/** Replace remote img src with empty so the renderer never hits ADO without NTLM. */
export function blankRemoteImageSrcs(html: string) {
  return html.replace(/<img\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>/gi, (full, pre, src, post) => {
    const decoded = String(src || '').replace(/&amp;/gi, '&').trim()
    if (!isRemoteMediaUrl(decoded)) return full
    return `<img${pre}src="" data-ado-src="${decoded.replace(/"/g, '&quot;')}"${post}>`
  })
}

export async function rewriteHtmlImageSrcs(html: string) {
  const urls = extractHtmlImageSrcs(html).filter(isRemoteMediaUrl)
  if (!urls.length) return html

  const resolved = await Promise.all(
    urls.map(async (url) => {
      try {
        return [url, await resolveMediaUrl(url)] as const
      } catch (error) {
        console.warn('[media] fetch failed', url, error)
        // Never fall back to the remote URL in the renderer (401 without NTLM).
        return [url, ''] as const
      }
    }),
  )

  let next = html
  for (const [from, to] of resolved) {
    next = next.split(from).join(to)
    const encoded = from.replace(/&/g, '&amp;')
    if (encoded !== from) next = next.split(encoded).join(to)
  }
  return next
}

/**
 * Rewrite remote imgs to authenticated data URLs and return reverse map
 * (dataUrl → original ADO url) for saving HTML back to Azure.
 */
export async function materializeHtmlImages(html: string): Promise<{
  html: string
  dataToOriginal: Map<string, string>
}> {
  const dataToOriginal = new Map<string, string>()
  const urls = extractHtmlImageSrcs(html).filter(isRemoteMediaUrl)
  if (!urls.length) return { html, dataToOriginal }

  let next = html
  for (const url of urls) {
    try {
      const dataUrl = await resolveMediaUrl(url)
      dataToOriginal.set(dataUrl, url)
      next = next.split(url).join(dataUrl)
      const encoded = url.replace(/&/g, '&amp;')
      if (encoded !== url) next = next.split(encoded).join(dataUrl)
    } catch (error) {
      console.warn('[media] materialize failed', url, error)
    }
  }
  return { html: next, dataToOriginal }
}

export function restoreOriginalImageSrcs(html: string, dataToOriginal: Map<string, string>) {
  let next = html
  for (const [dataUrl, original] of dataToOriginal) {
    if (!dataUrl || !original) continue
    next = next.split(dataUrl).join(original)
  }
  return next
}
