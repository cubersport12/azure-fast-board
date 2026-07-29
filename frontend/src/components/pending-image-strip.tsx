import { X } from 'lucide-react'
import { AuthenticatedImage } from '@/components/authenticated-media'
import type { PendingImage } from '@/lib/clipboard-image'

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
      aria-label={label}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  )
}

export function PendingImageStrip({
  images,
  onRemove,
}: {
  images: PendingImage[]
  onRemove: (id: string) => void
}) {
  if (!images.length) return null

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((image) => (
        <div
          key={image.id}
          className="group relative h-20 w-28 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
        >
          <img src={image.previewUrl} alt={image.fileName} className="h-full w-full object-cover" />
          <RemoveButton onClick={() => onRemove(image.id)} label="Удалить изображение" />
        </div>
      ))}
    </div>
  )
}

/** Saved / remote images with the same hover-X as pending screenshots. */
export function RemovableImageStrip({
  images,
  onRemove,
  disabled,
}: {
  images: Array<{ id: string; src: string; alt?: string }>
  onRemove: (id: string) => void
  disabled?: boolean
}) {
  if (!images.length) return null

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((image) => (
        <div
          key={image.id}
          className="group relative h-20 w-28 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
        >
          <AuthenticatedImage
            src={image.src}
            alt={image.alt || 'Вложение'}
            className="h-full w-full object-cover"
          />
          {!disabled && (
            <RemoveButton onClick={() => onRemove(image.id)} label="Удалить вложение" />
          )}
        </div>
      ))}
    </div>
  )
}
