import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  blankRemoteImageSrcs,
  resolveMediaUrl,
  rewriteHtmlImageSrcs,
} from '@/lib/authenticated-media'
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
  onImageClick,
}: {
  html: string
  className?: string
  /** Click on an <img> inside the rendered html — original ADO url when known. */
  onImageClick?: (src: string) => void
}) {
  // Never paint remote ADO img src in the renderer (no NTLM → 401).
  const [resolved, setResolved] = useState(() =>
    blankRemoteImageSrcs(normalizeHtmlEntities(html)),
  )

  useEffect(() => {
    let cancelled = false
    const normalized = normalizeHtmlEntities(html)
    setResolved(blankRemoteImageSrcs(normalized))
    void rewriteHtmlImageSrcs(normalized).then((next) => {
      if (!cancelled) setResolved(next)
    })
    return () => {
      cancelled = true
    }
  }, [html])

  return (
    <div
      className={cn(
        // Длинные URL в комментариях переносятся и не ломают ширину контейнера.
        '[overflow-wrap:anywhere]',
        className,
        onImageClick && '[&_img]:cursor-zoom-in',
      )}
      dangerouslySetInnerHTML={{ __html: resolved }}
      onClick={
        onImageClick
          ? (event) => {
              const target = event.target as HTMLElement
              if (target.tagName !== 'IMG') return
              const img = target as HTMLImageElement
              // data-ado-src keeps the original url; data:/blob: replacements render directly.
              const src = img.dataset.adoSrc || img.currentSrc || img.getAttribute('src') || ''
              if (src) onImageClick(src)
            }
          : undefined
      }
    />
  )
}
