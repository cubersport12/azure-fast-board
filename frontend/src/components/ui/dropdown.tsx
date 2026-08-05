import { Check, ChevronDown, Search, Star } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { AppSettings, SelectFavoriteOption } from '../../../shared/types'
import { queryKeys, useSettings, useUpdateSettings } from '@/hooks/use-azure'
import { cn } from '@/lib/utils'

export interface DropdownOption {
  value: string
  label: string
  description?: string
}

type DropdownBaseProps = {
  id?: string
  options: DropdownOption[]
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
  /** Persist star-favorites under this key in AppSettings.selectFavorites. */
  favoritesKey?: string
  /** Show the search field. Default true. */
  searchable?: boolean
  className?: string
  /** Optional label rendered above the trigger (filter bar). */
  label?: string
}

type SingleDropdownProps = DropdownBaseProps & {
  multiple?: false
  value: string
  onChange: (next: string) => void
}

type MultiDropdownProps = DropdownBaseProps & {
  multiple: true
  value: string[]
  onChange: (next: string[]) => void
}

export type DropdownProps = SingleDropdownProps | MultiDropdownProps

function useDropdownFavorites(favoritesKey: string | undefined, options: DropdownOption[]) {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const qc = useQueryClient()
  const favorites: SelectFavoriteOption[] = favoritesKey
    ? (settings?.selectFavorites?.[favoritesKey] ?? [])
    : []

  const persistFavorites = (nextList: SelectFavoriteOption[]) => {
    if (!favoritesKey) return
    const selectFavorites = {
      ...(settings?.selectFavorites ?? {}),
      [favoritesKey]: nextList,
    }
    const prev = qc.getQueryData<AppSettings>(queryKeys.settings)
    if (prev) qc.setQueryData(queryKeys.settings, { ...prev, selectFavorites })
    updateSettings.mutate({ selectFavorites })
  }

  const toggleFavorite = (option: DropdownOption) => {
    if (!favoritesKey) return
    const current = settings?.selectFavorites?.[favoritesKey] ?? []
    const exists = current.some((entry) => entry.value === option.value)
    const nextList = exists
      ? current.filter((entry) => entry.value !== option.value)
      : [
          ...current,
          {
            value: option.value,
            label: option.label,
            ...(option.description ? { description: option.description } : {}),
          },
        ]
    persistFavorites(nextList)
  }

  // Refresh stored labels when search results include a favorite (legacy id-only rows).
  useEffect(() => {
    if (!favoritesKey || !favorites.length || !options.length) return
    let changed = false
    const nextList = favorites.map((fav) => {
      const live = options.find((option) => option.value === fav.value)
      if (!live) return fav
      const sameLabel = live.label === fav.label
      const sameDescription = (live.description || '') === (fav.description || '')
      if (sameLabel && sameDescription) return fav
      changed = true
      return {
        value: live.value,
        label: live.label,
        ...(live.description ? { description: live.description } : {}),
      }
    })
    if (changed) persistFavorites(nextList)
  }, [favoritesKey, options, favorites])

  return {
    favorites,
    favoriteValues: favorites.map((entry) => entry.value),
    toggleFavorite,
    enabled: Boolean(favoritesKey),
  }
}

function isResolvedLabel(option: Pick<DropdownOption, 'value' | 'label'>) {
  const label = (option.label || '').trim()
  return Boolean(label) && label !== option.value
}

/** Prefer a human-readable row (ФИО) over a raw id placeholder. */
function pickBestOption(...candidates: Array<DropdownOption | undefined>): DropdownOption | undefined {
  const present = candidates.filter((entry): entry is DropdownOption => Boolean(entry))
  if (!present.length) return undefined
  return present.find((entry) => isResolvedLabel(entry)) || present[0]
}

/** Favorites stay visible even when the live options list comes from a new search. */
function mergeOptionsWithFavorites(
  options: DropdownOption[],
  favorites: SelectFavoriteOption[],
  remembered: Map<string, DropdownOption>,
): DropdownOption[] {
  if (!favorites.length && !remembered.size) return options

  const byValue = new Map<string, DropdownOption>()
  for (const fav of favorites) {
    const stored: DropdownOption = {
      value: fav.value,
      label: fav.label || fav.value,
      ...(fav.description ? { description: fav.description } : {}),
    }
    byValue.set(
      fav.value,
      pickBestOption(remembered.get(fav.value), stored) || stored,
    )
  }
  for (const option of options) {
    byValue.set(option.value, pickBestOption(option, byValue.get(option.value)) || option)
  }

  const merged: DropdownOption[] = []
  const seen = new Set<string>()
  for (const fav of favorites) {
    const option = byValue.get(fav.value)
    if (!option || seen.has(option.value)) continue
    merged.push(option)
    seen.add(option.value)
  }
  for (const option of options) {
    if (seen.has(option.value)) continue
    merged.push(option)
    seen.add(option.value)
  }
  return merged
}

export function Dropdown(props: DropdownProps) {
  const {
    id,
    options,
    onSearch,
    onCreate,
    placeholder = 'Выберите…',
    emptyLabel = 'Не назначен',
    searchPlaceholder = 'Поиск…',
    suggestionsLabel,
    createLabel = 'Создать новый',
    allowEmpty = true,
    disabled,
    favoritesKey,
    searchable = true,
    className,
    label,
  } = props

  const multiple = props.multiple === true
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const {
    favorites,
    favoriteValues,
    toggleFavorite,
    enabled: favoritesEnabled,
  } = useDropdownFavorites(favoritesKey, options)

  const rememberedOptions = useRef(new Map<string, DropdownOption>())
  useEffect(() => {
    for (const option of options) {
      if (isResolvedLabel(option)) rememberedOptions.current.set(option.value, option)
    }
  }, [options])

  const mergedOptions = useMemo(
    () => mergeOptionsWithFavorites(options, favorites, rememberedOptions.current),
    [options, favorites],
  )

  const selectedSingle = !multiple
    ? mergedOptions.find((option) => option.value === props.value)
    : undefined

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return mergedOptions
    return mergedOptions.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        (option.description || '').toLowerCase().includes(needle) ||
        option.value.toLowerCase().includes(needle),
    )
  }, [mergedOptions, query])

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
    if (searchable) requestAnimationFrame(() => searchRef.current?.focus())
  }, [open, searchable])

  const onSearchRef = useRef(onSearch)
  onSearchRef.current = onSearch

  useEffect(() => {
    onSearchRef.current?.(query)
  }, [query])

  useEffect(() => {
    setActiveIndex(0)
  }, [filtered.length, query])

  const chooseSingle = (next: string) => {
    if (multiple) return
    props.onChange(next)
    setOpen(false)
  }

  const toggleMulti = (optionValue: string) => {
    if (!multiple) return
    const current = props.value
    props.onChange(
      current.includes(optionValue)
        ? current.filter((entry) => entry !== optionValue)
        : [...current, optionValue],
    )
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

  const rows = allowEmpty && !multiple ? [{ value: '', label: emptyLabel }, ...filtered] : filtered

  const triggerLabel = multiple
    ? props.value.length === 0
      ? placeholder
      : props.value.length === 1
        ? options.find((option) => option.value === props.value[0])?.label || props.value[0]
        : `${props.value.length} выбрано`
    : selectedSingle?.label || (props.value ? props.value : placeholder)

  const hasSelection = multiple ? props.value.length > 0 : Boolean(props.value)

  const favoriteCount = favoritesEnabled
    ? filtered.filter((option) => favoriteValues.includes(option.value)).length
    : 0

  return (
    <div className={cn(label ? 'min-w-[160px] flex-1' : undefined, className)} ref={rootRef}>
      {label && <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>}
      <div className="relative">
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-8 w-full items-center justify-between gap-2 rounded-lg border bg-background px-2.5 text-left text-sm shadow-xs transition-colors',
            hasSelection
              ? 'border-ring/30 text-foreground'
              : 'border-input text-muted-foreground',
            disabled && 'opacity-60',
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', open && 'rotate-180')} />
        </button>

        {open && (
          <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
            {searchable && (
              <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
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
                      if (!row) return
                      if (multiple) {
                        if (row.value) toggleMulti(row.value)
                      } else {
                        chooseSingle(row.value)
                      }
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="h-7 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            )}
            <div id={listId} role="listbox" className="max-h-60 overflow-auto py-1">
              {suggestionsLabel && filtered.length > 0 && (
                <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {suggestionsLabel}
                </div>
              )}
              {allowEmpty && !multiple && (
                <>
                  <button
                    type="button"
                    role="option"
                    aria-selected={!props.value}
                    className={cn(
                      'flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted',
                      activeIndex === 0 && 'bg-muted',
                    )}
                    onMouseEnter={() => setActiveIndex(0)}
                    onClick={() => chooseSingle('')}
                  >
                    {emptyLabel}
                    {!props.value && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                  <div className="my-1 border-t border-border" />
                </>
              )}
              {allowEmpty && multiple && (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
                    onClick={() => props.onChange([])}
                  >
                    {emptyLabel || placeholder}
                    {props.value.length === 0 && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                  <div className="my-1 border-t border-border" />
                </>
              )}
              {filtered.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">Ничего не найдено</div>
              )}
              {filtered.map((option, index) => {
                const rowIndex = allowEmpty && !multiple ? index + 1 : index
                const active = activeIndex === rowIndex
                const checked = multiple
                  ? props.value.includes(option.value)
                  : option.value === props.value
                const isFavorite = favoriteValues.includes(option.value)
                const showFavoriteDivider =
                  favoritesEnabled &&
                  favoriteCount > 0 &&
                  index === favoriteCount &&
                  !query.trim()

                return (
                  <div key={option.value}>
                    {showFavoriteDivider && (
                      <div className="my-1 border-t border-border" />
                    )}
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      className={cn(
                        'group flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted',
                        (active || checked) && 'bg-accent text-accent-foreground',
                        isFavorite && 'transition-transform duration-200',
                      )}
                      onMouseEnter={() => setActiveIndex(rowIndex)}
                      onClick={() => {
                        if (multiple) toggleMulti(option.value)
                        else chooseSingle(option.value)
                      }}
                    >
                      {multiple && (
                        <span
                          className={cn(
                            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            checked
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-input bg-background',
                          )}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{option.label}</span>
                        {option.description && option.description !== option.label && (
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </span>
                      {favoritesEnabled && (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={isFavorite ? 'Убрать из избранного' : 'В избранное'}
                          className={cn(
                            'mt-0.5 shrink-0 rounded p-0.5 transition',
                            isFavorite
                              ? 'text-amber-500'
                              : 'text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-amber-500',
                          )}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            toggleFavorite(option)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              event.stopPropagation()
                              toggleFavorite(option)
                            }
                          }}
                        >
                          <Star
                            className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')}
                          />
                        </span>
                      )}
                      {!multiple && checked && (
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
            {onCreate && (
              <div className="border-t border-border p-1.5">
                <button
                  type="button"
                  disabled={!canCreate}
                  className={cn(
                    'flex w-full items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium',
                    canCreate
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'cursor-not-allowed bg-muted text-muted-foreground',
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
    </div>
  )
}
