import { Check, ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { StoredFilterPreset, WorkItem } from '../../shared/types'
import { Button } from '@/components/ui/button'
import { Dropdown } from '@/components/ui/dropdown'
import { Dialog, Input, Label } from '@/components/ui/primitives'
import { useSettings, useUpdateSettings } from '@/hooks/use-azure'
import {
  COMPLETED_STATES,
  DEFAULT_FILTERS,
  EMPTY_FILTERS,
  FILTER_PRESETS,
  ME_ASSIGNEE,
  filtersForPreset,
  hasActiveFilters,
  matchFilterPreset,
  normalizeWorkItemFilters,
  uniqueOptions,
  type WorkItemFilters,
} from '@/lib/work-item-filters'
import { cn } from '@/lib/utils'

function newPresetId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function FilterPresetEditorDialog({
  open,
  title,
  initialName,
  confirmLabel,
  showUpdateFromCurrent,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  initialName: string
  confirmLabel: string
  showUpdateFromCurrent?: boolean
  onClose: () => void
  onSave: (name: string, updateFromCurrent: boolean) => void
}) {
  const [name, setName] = useState(initialName)
  const [updateFromCurrent, setUpdateFromCurrent] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setUpdateFromCurrent(false)
  }, [open, initialName])

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          const next = name.trim()
          if (!next) return
          onSave(next, updateFromCurrent)
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="filter-preset-name">Название</Label>
          <Input
            id="filter-preset-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например: Мои баги"
            autoFocus
          />
        </div>
        {showUpdateFromCurrent && (
          <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              className="mt-1"
              checked={updateFromCurrent}
              onChange={(event) => setUpdateFromCurrent(event.target.checked)}
            />
            <span>Заменить набор фильтров текущими с панели</span>
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={!name.trim()}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
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
  const [editor, setEditor] = useState<null | { mode: 'create' } | { mode: 'edit'; preset: StoredFilterPreset }>(
    null,
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const customPresets = settings?.filterPresets ?? []

  const activeId = matchFilterPreset(filters, availableStates, customPresets)
  const activeLabel =
    FILTER_PRESETS.find((preset) => preset.id === activeId)?.label ||
    customPresets.find((preset) => preset.id === activeId)?.name

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

  const persistPresets = (next: StoredFilterPreset[]) => {
    updateSettings.mutate({ filterPresets: next })
  }

  const applyCustom = (preset: StoredFilterPreset) => {
    onChange(normalizeWorkItemFilters(preset.filters))
    setOpen(false)
  }

  const canSaveCurrent = hasActiveFilters(filters)

  return (
    <>
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
          <div className="absolute right-0 z-40 mt-1 min-w-[260px] overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <div className="max-h-72 overflow-auto py-1">
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

              {customPresets.length > 0 && (
                <>
                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                  <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Мои пресеты
                  </div>
                  {customPresets.map((preset) => {
                    const checked = preset.id === activeId
                    return (
                      <div
                        key={preset.id}
                        className={cn(
                          'group flex w-full items-center gap-1 px-1.5 py-0.5',
                          checked && 'bg-sky-50 dark:bg-sky-950',
                        )}
                      >
                        <button
                          type="button"
                          role="option"
                          aria-selected={checked}
                          className={cn(
                            'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800',
                            checked && 'text-sky-900 dark:text-sky-200',
                          )}
                          onClick={() => applyCustom(preset)}
                        >
                          <span className="truncate">{preset.name}</span>
                          {checked && <Check className="h-3.5 w-3.5 shrink-0 text-sky-600" />}
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-slate-400 opacity-0 hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          title="Изменить"
                          aria-label={`Изменить пресет ${preset.name}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            setOpen(false)
                            setEditor({ mode: 'edit', preset })
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-slate-400 opacity-0 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-950 dark:hover:text-rose-300"
                          title="Удалить"
                          aria-label={`Удалить пресет ${preset.name}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (!window.confirm(`Удалить пресет «${preset.name}»?`)) return
                            persistPresets(customPresets.filter((entry) => entry.id !== preset.id))
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            <div className="border-t border-slate-100 p-1.5 dark:border-slate-800">
              <button
                type="button"
                disabled={!canSaveCurrent}
                className={cn(
                  'flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
                  canSaveCurrent
                    ? 'bg-sky-600 text-white hover:bg-sky-700'
                    : 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
                )}
                onClick={() => {
                  setOpen(false)
                  setEditor({ mode: 'create' })
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Сохранить текущие…
              </button>
            </div>
          </div>
        )}
      </div>

      <FilterPresetEditorDialog
        open={editor?.mode === 'create'}
        title="Новый пресет фильтров"
        initialName=""
        confirmLabel="Создать"
        onClose={() => setEditor(null)}
        onSave={(name) => {
          const next: StoredFilterPreset = {
            id: newPresetId(),
            name,
            filters: { ...filters },
          }
          persistPresets([...customPresets, next])
          setEditor(null)
        }}
      />

      <FilterPresetEditorDialog
        open={editor?.mode === 'edit'}
        title="Изменить пресет"
        initialName={editor?.mode === 'edit' ? editor.preset.name : ''}
        confirmLabel="Сохранить"
        showUpdateFromCurrent
        onClose={() => setEditor(null)}
        onSave={(name, updateFromCurrent) => {
          if (editor?.mode !== 'edit') return
          const next = customPresets.map((entry) =>
            entry.id === editor.preset.id
              ? {
                  ...entry,
                  name,
                  filters: updateFromCurrent ? { ...filters } : entry.filters,
                }
              : entry,
          )
          persistPresets(next)
          setEditor(null)
        }}
      />
    </>
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
  trailing,
}: {
  items: WorkItem[]
  filters: WorkItemFilters
  onChange: (next: WorkItemFilters) => void
  /** Extra controls in the filter header (e.g. board card views). */
  trailing?: ReactNode
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

  const toOptions = (list: string[]) =>
    list.map((value) => ({ value, label: formatOptionLabel(value) }))

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Фильтры</div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterPresetDropdown
            filters={normalizedFilters}
            availableStates={options.states}
            onChange={onChange}
          />
          {trailing}
          {active && (
            <Button size="sm" variant="ghost" onClick={() => onChange(EMPTY_FILTERS)}>
              <X className="h-3.5 w-3.5" /> Сбросить
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Dropdown
          multiple
          label="Тип"
          favoritesKey="filter-types"
          options={toOptions(options.types)}
          value={normalizedFilters.types}
          onChange={(types) => onChange({ ...normalizedFilters, types })}
          placeholder="Все"
          emptyLabel="Все"
          searchPlaceholder="Поиск типа…"
        />
        <Dropdown
          multiple
          label="Состояние"
          favoritesKey="filter-states"
          options={toOptions(options.states)}
          value={normalizedFilters.states}
          onChange={(states) => onChange({ ...normalizedFilters, states })}
          placeholder="Все"
          emptyLabel="Все"
          searchPlaceholder="Поиск состояния…"
        />
        <Dropdown
          multiple
          label="Исполнитель"
          favoritesKey="filter-assignees"
          options={toOptions(options.assignees)}
          value={normalizedFilters.assignees}
          onChange={(assignees) => onChange({ ...normalizedFilters, assignees })}
          placeholder="Все"
          emptyLabel="Все"
          searchPlaceholder="Поиск исполнителя…"
        />
        <Dropdown
          multiple
          label="Автор"
          favoritesKey="filter-creators"
          options={toOptions(options.creators)}
          value={normalizedFilters.creators}
          onChange={(creators) => onChange({ ...normalizedFilters, creators })}
          placeholder="Все"
          emptyLabel="Все"
          searchPlaceholder="Поиск автора…"
        />
        <Dropdown
          multiple
          label="Теги"
          favoritesKey="filter-tags"
          options={toOptions(options.tags)}
          value={normalizedFilters.tags}
          onChange={(tags) => onChange({ ...normalizedFilters, tags })}
          placeholder="Все"
          emptyLabel="Все"
          searchPlaceholder="Поиск тэга…"
        />
      </div>
    </div>
  )
}
