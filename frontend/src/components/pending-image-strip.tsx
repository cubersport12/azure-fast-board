import { X } from 'lucide-react'
import type { PendingImage } from '@/lib/clipboard-image'

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
          <button
            type="button"
            className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
            onClick={() => onRemove(image.id)}
            aria-label="Удалить изображение"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
