import { Check, ChevronDown, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkItem } from '../../shared/types'
import { Button } from '@/components/ui/button'
import {
  COMPLETED_STATES,
  DEFAULT_FILTERS,
  FILTER_PRESETS,
  ME_ASSIGNEE,
  filtersForPreset,
  hasActiveFilters,
  matchFilterPreset,
  uniqueOptions,
  type WorkItemFilters,
} from '@/lib/work-item-filters'
import { cn } from '@/lib/utils'

function MultiSelectDropdown({
  label,
  options,
  value,
  onChange,
  placeholder = 'Все',
}: {
  label: string
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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

  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? formatOptionLabel(value[0])
        : `${value.length} выбрано`

  const toggle = (option: string) => {
    onChange(value.includes(option) ? value.filter((entry) => entry !== option) : [...value, option])
  }

  return (
    <div className="min-w-[160px] flex-1" ref={rootRef}>
      <div className="mb-1 text-xs font-medium text-slate-500">{label}</div>
      <div className="relative">
        <button
          type="button"
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-white px-3 text-left text-sm dark:bg-slate-950',
            value.length
              ? 'border-sky-300 text-slate-900 dark:border-sky-700 dark:text-slate-100'
              : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300',
          )}
          onClick={() => setOpen((current) => !current)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition', open && 'rotate-180')} />
        </button>

        {open && (
          <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
              onClick={() => onChange([])}
            >
              {placeholder}
              {value.length === 0 && <Check className="h-3.5 w-3.5 text-sky-600" />}
            </button>
            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
            {options.length === 0 && (
              <div className="px-3 py-2 text-sm text-slate-400">Нет вариантов</div>
            )}
            {options.map((option) => {
              const checked = value.includes(option)
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800',
                    checked && 'bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
                  )}
                  onClick={() => toggle(option)}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded border',
                      checked
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-950',
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{formatOptionLabel(option)}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterPresetDropdown({
  filters,
  availableStates,
  onChange,
}: {
  filters: WorkItemFilters
  availableStates: string[]
  onChange: (next: WorkItemFilters) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const activeId = matchFilterPreset(filters, availableStates)
  const activeLabel = FILTER_PRESETS.find((preset) => preset.id === activeId)?.label

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

  return (
    <div className="relative" ref={rootRef}>
      <Button
        type="button"
        size="sm"
        variant={activeId ? 'default' : 'outline'}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {activeLabel || 'Предустановки'}
        <ChevronDown className={cn('h-3.5 w-3.5 transition', open && 'rotate-180')} />
      </Button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 min-w-[220px] overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {FILTER_PRESETS.map((preset) => {
            const checked = preset.id === activeId
            return (
              <button
                key={preset.id}
                type="button"
                role="option"
                aria-selected={checked}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800',
                  checked && 'bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
                )}
                onClick={() => {
                  onChange(filtersForPreset(preset.id, availableStates))
                  setOpen(false)
                }}
              >
                <span>{preset.label}</span>
                {checked && <Check className="h-3.5 w-3.5 shrink-0 text-sky-600" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatOptionLabel(option: string) {
  if (option === ME_ASSIGNEE) return 'Я'
  if (option === 'Unassigned') return 'Не назначен'
  return option
}

export function WorkItemFilterBar({
  items,
  filters,
  onChange,
}: {
  items: WorkItem[]
  filters: WorkItemFilters
  onChange: (next: WorkItemFilters) => void
}) {
  const options = useMemo(() => {
    const base = uniqueOptions(items)
    const merge = (list: string[], extras: string[]) =>
      [...new Set([...extras, ...list])].sort((a, b) => a.localeCompare(b))

    const assignees = [...base.assignees]
    if (items.some((item) => !item.assignedTo) && !assignees.includes('Unassigned')) {
      assignees.unshift('Unassigned')
    }
    const withoutMe = assignees.filter((entry) => entry !== ME_ASSIGNEE)
    const creators = base.creators.filter((entry) => entry !== ME_ASSIGNEE)

    return {
      types: merge(base.types, DEFAULT_FILTERS.types),
      states: merge(base.states, [...DEFAULT_FILTERS.states, ...COMPLETED_STATES]),
      assignees: [ME_ASSIGNEE, ...withoutMe],
      creators: [ME_ASSIGNEE, ...creators],
      tags: base.tags,
    }
  }, [items])

  const normalizedFilters: WorkItemFilters = {
    ...filters,
    creators: filters.creators ?? [],
  }

  const active = hasActiveFilters(normalizedFilters)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Фильтры</div>
        <div className="flex items-center gap-2">
          <FilterPresetDropdown
            filters={normalizedFilters}
            availableStates={options.states}
            onChange={onChange}
          />
          {active && (
            <Button size="sm" variant="ghost" onClick={() => onChange(DEFAULT_FILTERS)}>
              <X className="h-3.5 w-3.5" /> Сбросить
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MultiSelectDropdown
          label="Тип"
          options={options.types}
          value={normalizedFilters.types}
          onChange={(types) => onChange({ ...normalizedFilters, types })}
          placeholder="Все"
        />
        <MultiSelectDropdown
          label="Состояние"
          options={options.states}
          value={normalizedFilters.states}
          onChange={(states) => onChange({ ...normalizedFilters, states })}
          placeholder="Все"
        />
        <MultiSelectDropdown
          label="Исполнитель"
          options={options.assignees}
          value={normalizedFilters.assignees}
          onChange={(assignees) => onChange({ ...normalizedFilters, assignees })}
          placeholder="Все"
        />
        <MultiSelectDropdown
          label="Автор"
          options={options.creators}
          value={normalizedFilters.creators}
          onChange={(creators) => onChange({ ...normalizedFilters, creators })}
          placeholder="Все"
        />
        <MultiSelectDropdown
          label="Теги"
          options={options.tags}
          value={normalizedFilters.tags}
          onChange={(tags) => onChange({ ...normalizedFilters, tags })}
          placeholder="Все"
        />
      </div>
    </div>
  )
}
