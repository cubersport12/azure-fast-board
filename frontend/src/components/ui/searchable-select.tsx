import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface SearchableOption {
  value: string
  label: string
  description?: string
}

export function SearchableSelect({
  id,
  value,
  options,
  onChange,
  onSearch,
  onCreate,
  placeholder = 'Выберите…',
  emptyLabel = 'Не назначен',
  searchPlaceholder = 'Поиск…',
  suggestionsLabel,
  createLabel = 'Создать новый',
  allowEmpty = true,
  disabled,
}: {
  id?: string
  value: string
  options: SearchableOption[]
  onChange: (next: string) => void
  onSearch?: (query: string) => void
  /** When set, shows a footer action that creates from the current search query. */
  onCreate?: (query: string) => void
  placeholder?: string
  emptyLabel?: string
  searchPlaceholder?: string
  /** Optional header above the options list (Azure-style "Suggestions"). */
  suggestionsLabel?: string
  createLabel?: string
  allowEmpty?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const selected = options.find((option) => option.value === value)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        (option.description || '').toLowerCase().includes(needle) ||
        option.value.toLowerCase().includes(needle),
    )
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    requestAnimationFrame(() => searchRef.current?.focus())
  }, [open])

  const onSearchRef = useRef(onSearch)
  onSearchRef.current = onSearch

  useEffect(() => {
    onSearchRef.current?.(query)
  }, [query])

  useEffect(() => {
    setActiveIndex(0)
  }, [filtered.length, query])

  const choose = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  const createQuery = query.trim()
  const canCreate =
    Boolean(onCreate) &&
    createQuery.length > 0 &&
    !options.some((option) => option.value.toLowerCase() === createQuery.toLowerCase())

  const create = () => {
    if (!canCreate || !onCreate) return
    onCreate(createQuery)
    setOpen(false)
  }

  const rows = allowEmpty ? [{ value: '', label: emptyLabel }, ...filtered] : filtered

  return (
    <div className="relative" ref={rootRef}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-white px-3 text-left text-sm dark:bg-slate-950',
          value ? 'border-sky-300 text-slate-900 dark:border-sky-700 dark:text-slate-100' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300',
          disabled && 'opacity-60',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{selected?.label || (value ? value : placeholder)}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-100 px-2 py-1.5 dark:border-slate-800">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setActiveIndex((index) => Math.min(index + 1, rows.length - 1))
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setActiveIndex((index) => Math.max(index - 1, 0))
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  if (canCreate && filtered.length === 0) {
                    create()
                    return
                  }
                  const row = rows[activeIndex]
                  if (row) choose(row.value)
                }
              }}
              placeholder={searchPlaceholder}
              className="h-7 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
          <div id={listId} role="listbox" className="max-h-60 overflow-auto py-1">
            {suggestionsLabel && filtered.length > 0 && (
              <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                {suggestionsLabel}
              </div>
            )}
            {allowEmpty && (
              <>
                <button
                  type="button"
                  role="option"
                  aria-selected={!value}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800',
                    activeIndex === 0 && 'bg-slate-50 dark:bg-slate-800',
                  )}
                  onMouseEnter={() => setActiveIndex(0)}
                  onClick={() => choose('')}
                >
                  {emptyLabel}
                  {!value && <Check className="h-3.5 w-3.5 text-sky-600" />}
                </button>
                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              </>
            )}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-slate-400">Ничего не найдено</div>
            )}
            {filtered.map((option, index) => {
              const rowIndex = allowEmpty ? index + 1 : index
              const active = activeIndex === rowIndex
              const checked = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800',
                    (active || checked) && 'bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
                  )}
                  onMouseEnter={() => setActiveIndex(rowIndex)}
                  onClick={() => choose(option.value)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{option.label}</span>
                    {option.description && option.description !== option.label && (
                      <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {option.description}
                      </span>
                    )}
                  </span>
                  {checked && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />}
                </button>
              )
            })}
          </div>
          {onCreate && (
            <div className="border-t border-slate-100 p-1.5 dark:border-slate-800">
              <button
                type="button"
                disabled={!canCreate}
                className={cn(
                  'flex w-full items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium',
                  canCreate
                    ? 'bg-sky-600 text-white hover:bg-sky-700'
                    : 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
                )}
                onClick={create}
              >
                {createLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
