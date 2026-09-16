import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { ChevronLeft, ChevronRight, Maximize, Minus, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { resolveMediaUrl } from '@/lib/authenticated-media'
import { cn } from '@/lib/utils'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 5

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

/** Zoom + pan in one state so wheel zoom-to-cursor stays atomic. */
interface Viewport {
  zoom: number
  x: number
  y: number
}

const INITIAL_VIEWPORT: Viewport = { zoom: 1, x: 0, y: 0 }

export interface ViewerImage {
  src: string
  alt: string
}

function ViewerButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/90 transition hover:bg-white/10"
    >
      {children}
    </button>
  )
}

/**
 * Fullscreen gallery viewer for a card's images: wheel / Ctrl+wheel zoom to
 * cursor, prev/next navigation, drag panning, click outside the image closes.
 * Accepts raw ADO attachment URLs — resolved via IPC like AuthenticatedImage.
 */
export function ImageViewerDialog({
  images,
  index,
  onClose,
}: {
  images: ViewerImage[]
  index: number | null
  onClose: () => void
}) {
  const open = index != null && images.length > 0
  const [pos, setPos] = useState(0)
  const [resolved, setResolved] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<Viewport>(INITIAL_VIEWPORT)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ pointerX: number; pointerY: number; baseX: number; baseY: number } | null>(
    null,
  )
  const downRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const safePos = open ? Math.max(0, Math.min(pos, images.length - 1)) : 0
  const current = open ? images[safePos] : undefined
  const currentSrc = current?.src ?? null

  const reset = useCallback(() => setView(INITIAL_VIEWPORT), [])

  // Открытие галереи: встаём на выбранную картинку.
  useEffect(() => {
    if (index == null) return
    setPos(Math.max(0, Math.min(index, images.length - 1)))
  }, [index, images.length])

  // Смена текущей картинки (открытие или листание): сброс масштаба и загрузка.
  useEffect(() => {
    if (!currentSrc) return
    setResolved(null)
    setFailed(false)
    reset()
    let cancelled = false
    void resolveMediaUrl(currentSrc)
      .then((url) => {
        if (!cancelled) setResolved(url)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [currentSrc, reset])

  const goPrev = useCallback(
    () => setPos((p) => (images.length ? (p - 1 + images.length) % images.length : 0)),
    [images.length],
  )
  const goNext = useCallback(
    () => setPos((p) => (images.length ? (p + 1) % images.length : 0)),
    [images.length],
  )

  const zoomTo = useCallback(
    (next: number) => setView((v) => ({ ...v, zoom: clampZoom(next) })),
    [],
  )

  // Wheel (plain or with Ctrl — touchpad pinch sends the same) zooms toward the
  // cursor. Non-passive: preventDefault also blocks the page scroll and
  // Chromium's ctrl+wheel page zoom while the viewer is open.
  const handleWheel = useCallback((event: WheelEvent) => {
    const viewport = viewportRef.current
    if (!viewport) return
    event.preventDefault()
    const rect = viewport.getBoundingClientRect()
    const cx = event.clientX - rect.left - rect.width / 2
    const cy = event.clientY - rect.top - rect.height / 2
    const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.0025 : 0.0015))
    setView((v) => {
      const zoom = clampZoom(v.zoom * factor)
      if (zoom === v.zoom) return v
      return {
        zoom,
        x: cx - ((cx - v.x) / v.zoom) * zoom,
        y: cy - ((cy - v.y) / v.zoom) * zoom,
      }
    })
  }, [])

  // Attach in the ref callback, not in an effect keyed on the open flag: base-ui
  // mounts its portal one commit after the viewer opens, so the effect would
  // find no node and the wheel listener would be lost for the whole session.
  // Detach via the ref's own cleanup so StrictMode's double mount cannot leave
  // the node with the listener removed (an effect cleanup runs after re-attach).
  const attachViewport = useCallback(
    (node: HTMLDivElement | null) => {
      viewportRef.current = node
      if (!node) return
      node.addEventListener('wheel', handleWheel, { passive: false })
      return () => {
        node.removeEventListener('wheel', handleWheel)
        if (viewportRef.current === node) viewportRef.current = null
      }
    },
    [handleWheel],
  )

  // +/-/0/arrows shortcuts while the viewer is open (Esc is handled by base-ui).
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '+' || event.key === '=') zoomTo(view.zoom + 0.25)
      if (event.key === '-') zoomTo(view.zoom - 0.25)
      if (event.key === '0') reset()
      if (event.key === 'ArrowLeft' && images.length > 1) goPrev()
      if (event.key === 'ArrowRight' && images.length > 1) goNext()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, view.zoom, images.length, zoomTo, reset, goPrev, goNext])

  if (!open || !current) return null

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    downRef.current = { x: event.clientX, y: event.clientY, moved: false }
    if (view.zoom <= 1 || event.button !== 0) return
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      baseX: view.x,
      baseY: view.y,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (downRef.current) {
      const dx = event.clientX - downRef.current.x
      const dy = event.clientY - downRef.current.y
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) downRef.current.moved = true
    }
    const drag = dragRef.current
    if (!drag) return
    setView((v) => ({
      ...v,
      x: drag.baseX + (event.clientX - drag.pointerX),
      y: drag.baseY + (event.clientY - drag.pointerY),
    }))
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    setDragging(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  // Клик по тёмной области (не по самому изображению, не после пана, не dblclick).
  const onViewportClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.detail !== 1) return
    const target = event.target as HTMLElement
    if (target.closest('img')) return
    if (downRef.current?.moved) return
    onClose()
  }

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    // Двойной клик по тёмной области закрывает (первый клик уже закрыл окно),
    // по изображению — переключает 100/200%.
    if (!(event.target as HTMLElement).closest('img')) return
    if (view.zoom === 1) {
      zoomTo(2)
      return
    }
    reset()
  }

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/85" />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex flex-col outline-none">
          <DialogPrimitive.Title className="sr-only">{current.alt}</DialogPrimitive.Title>
          <div className="flex items-center gap-1 px-3 py-2">
            <span className="mr-2 min-w-0 flex-1 truncate text-xs text-white/80">
              {current.alt}
            </span>
            {images.length > 1 && (
              <>
                <ViewerButton onClick={goPrev} title="Предыдущее (←)">
                  <ChevronLeft className="h-4 w-4" />
                </ViewerButton>
                <span className="w-14 text-center text-xs tabular-nums text-white/80">
                  {safePos + 1} / {images.length}
                </span>
                <ViewerButton onClick={goNext} title="Следующее (→)">
                  <ChevronRight className="h-4 w-4" />
                </ViewerButton>
              </>
            )}
            <ViewerButton onClick={() => zoomTo(view.zoom - 0.25)} title="Уменьшить (−)">
              <Minus className="h-4 w-4" />
            </ViewerButton>
            <span className="w-14 text-center text-xs tabular-nums text-white/80">
              {Math.round(view.zoom * 100)}%
            </span>
            <ViewerButton onClick={() => zoomTo(view.zoom + 0.25)} title="Увеличить (+)">
              <Plus className="h-4 w-4" />
            </ViewerButton>
            <ViewerButton onClick={reset} title="Сбросить масштаб (0)">
              <Maximize className="h-4 w-4" />
            </ViewerButton>
            <DialogPrimitive.Close
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white/90 hover:bg-white/10"
                />
              }
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Закрыть</span>
            </DialogPrimitive.Close>
          </div>
          <div
            ref={attachViewport}
            className={cn('relative flex-1 overflow-hidden select-none')}
            style={{
              cursor: view.zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
              touchAction: 'none',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={onViewportClick}
            onDoubleClick={onDoubleClick}
          >
            {failed && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
                Не удалось загрузить изображение
              </div>
            )}
            {!resolved && !failed && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
                Загрузка изображения…
              </div>
            )}
            {resolved && (
              <img
                src={resolved}
                alt={current.alt}
                draggable={false}
                className="absolute top-1/2 left-1/2 max-h-full max-w-full"
                style={{
                  transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px)) scale(${view.zoom})`,
                  transition: dragging ? 'none' : 'transform 120ms ease-out',
                }}
              />
            )}
          </div>
          <div className="px-3 py-1.5 text-center text-[11px] text-white/50">
            Клик вне картинки — закрыть · колесо / Ctrl+колесо — зум к курсору · ←/→ — листать ·
            двойной клик — 100/200% · перетаскивание — панорама
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
