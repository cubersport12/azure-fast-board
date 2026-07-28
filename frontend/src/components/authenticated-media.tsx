import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { resolveMediaUrl, rewriteHtmlImageSrcs } from '@/lib/authenticated-media'
import { decodeHtmlEntities } from '@/lib/html-text'

/** Soft-decode text nodes so &amp;quot; / &quot; / &nbsp; render as readable characters. */
function normalizeHtmlEntities(html: string) {
  return html.replace(/(<[^>]*>)|([^<]+)/g, (chunk, tag: string | undefined, text: string | undefined) => {
    if (tag) return tag
    if (!text) return chunk
    // Avoid turning &lt;/&gt; into real tags before innerHTML.
    return decodeHtmlEntities(text).replace(/</g, '&lt;').replace(/>/g, '&gt;')
  })
}

export function AuthenticatedImage({
  src,
  alt,
  className,
}: {
  src?: string | null
  alt: string
  className?: string
}) {
  const [resolved, setResolved] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    setResolved(null)

    if (!src) return

    void resolveMediaUrl(src)
      .then((url) => {
        if (!cancelled) setResolved(url)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [src])

  if (!src) return null
  if (failed) {
    return (
      <div
        className={cn(
          'rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500',
          className,
        )}
      >
        Не удалось загрузить изображение
      </div>
    )
  }
  if (!resolved) {
    return (
      <div
        className={cn(
          'rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-400',
          className,
        )}
      >
        Загрузка изображения…
      </div>
    )
  }

  return <img src={resolved} alt={alt} className={className} />
}

export function AuthenticatedHtml({
  html,
  className,
}: {
  html: string
  className?: string
}) {
  const [resolved, setResolved] = useState(() => normalizeHtmlEntities(html))

  useEffect(() => {
    let cancelled = false
    const normalized = normalizeHtmlEntities(html)
    setResolved(normalized)
    void rewriteHtmlImageSrcs(normalized).then((next) => {
      if (!cancelled) setResolved(next)
    })
    return () => {
      cancelled = true
    }
  }, [html])

  return <div className={className} dangerouslySetInnerHTML={{ __html: resolved }} />
}
