import { Check, Plus, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

type Props = {
  id?: string
  value: string[]
  options: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
}

export function TagsField({
  id,
  value,
  options,
  onChange,
  placeholder = 'Добавить тэг',
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  const available = useMemo(() => {
    const selected = new Set(value.map((t) => t.toLowerCase()))
    return options.filter((tag) => !selected.has(tag.toLowerCase()))
  }, [options, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return available
    return available.filter((tag) => tag.toLowerCase().includes(q))
  }, [available, query])

  const canCreate = useMemo(() => {
    const q = query.trim()
    if (!q) return false
    const lower = q.toLowerCase()
    if (value.some((tag) => tag.toLowerCase() === lower)) return false
    if (options.some((tag) => tag.toLowerCase() === lower)) return false
    return true
  }, [query, value, options])

  const updatePos = () => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePos()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onScroll = () => updatePos()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const add = (tag: string) => {
    const next = tag.trim()
    if (!next) return
    if (value.some((entry) => entry.toLowerCase() === next.toLowerCase())) return
    onChange([...value, next])
    setQuery('')
    setOpen(false)
  }

  const remove = (tag: string) => {
    onChange(value.filter((entry) => entry !== tag))
  }

  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                disabled={disabled}
                className="rounded-full p-0.5 hover:bg-muted"
                aria-label={`Удалить тэг ${tag}`}
                onClick={() => remove(tag)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        className={cn(
          'flex h-8 w-full items-center justify-between rounded-lg border border-input bg-background px-2.5 text-left text-sm',
          disabled && 'opacity-60',
        )}
        onClick={() => {
          if (disabled) return
          setOpen((v) => !v)
        }}
      >
        <span className="text-muted-foreground">{placeholder}</span>
        <Plus className="h-3.5 w-3.5 opacity-60" />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="z-[10050] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: Math.max(pos.width, 220),
            }}
          >
            <div className="border-b border-border p-2">
              <input
                autoFocus
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                value={query}
                placeholder="Поиск или новый тэг…"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (canCreate) add(query)
                    else if (filtered[0]) add(filtered[0])
                  }
                }}
              />
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              {filtered.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => add(tag)}
                >
                  <Check className="h-3.5 w-3.5 opacity-0" />
                  {tag}
                </button>
              ))}
              {filtered.length === 0 && !canCreate && (
                <div className="px-3 py-2 text-sm text-muted-foreground">Нет вариантов</div>
              )}
            </div>
            <div className="border-t border-border p-2">
              <button
                type="button"
                disabled={!canCreate}
                className={cn(
                  'flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium',
                  canCreate
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'cursor-not-allowed bg-muted text-muted-foreground',
                )}
                onClick={() => canCreate && add(query)}
              >
                <Plus className="h-3.5 w-3.5" />
                Создать{query.trim() ? `: ${query.trim()}` : ''}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
