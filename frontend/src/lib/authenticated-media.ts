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

export async function rewriteHtmlImageSrcs(html: string) {
  const urls = extractHtmlImageSrcs(html).filter(isRemoteMediaUrl)
  if (!urls.length) return html

  const resolved = await Promise.all(
    urls.map(async (url) => {
      try {
        return [url, await resolveMediaUrl(url)] as const
      } catch {
        return [url, url] as const
      }
    }),
  )

  let next = html
  for (const [from, to] of resolved) {
    if (from === to) continue
    next = next.split(from).join(to)
    const encoded = from.replace(/&/g, '&amp;')
    if (encoded !== from) next = next.split(encoded).join(to)
  }
  return next
}
