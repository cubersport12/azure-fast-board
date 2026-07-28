import { Check, ChevronDown, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkItem } from '../../shared/types'
import { Button } from '@/components/ui/button'
import {
  DEFAULT_FILTERS,
  ME_ASSIGNEE,
  hasActiveFilters,
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

    return {
      types: merge(base.types, DEFAULT_FILTERS.types),
      states: merge(base.states, DEFAULT_FILTERS.states),
      assignees: [ME_ASSIGNEE, ...withoutMe],
      tags: base.tags,
    }
  }, [items])

  const active = hasActiveFilters(filters)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Фильтры</div>
        {active && (
          <Button size="sm" variant="ghost" onClick={() => onChange(DEFAULT_FILTERS)}>
            <X className="h-3.5 w-3.5" /> Сбросить
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MultiSelectDropdown
          label="Тип"
          options={options.types}
          value={filters.types}
          onChange={(types) => onChange({ ...filters, types })}
          placeholder="Все"
        />
        <MultiSelectDropdown
          label="Состояние"
          options={options.states}
          value={filters.states}
          onChange={(states) => onChange({ ...filters, states })}
          placeholder="Все"
        />
        <MultiSelectDropdown
          label="Исполнитель"
          options={options.assignees}
          value={filters.assignees}
          onChange={(assignees) => onChange({ ...filters, assignees })}
          placeholder="Все"
        />
        <MultiSelectDropdown
          label="Теги"
          options={options.tags}
          value={filters.tags}
          onChange={(tags) => onChange({ ...filters, tags })}
          placeholder="Все"
        />
      </div>
    </div>
  )
}
