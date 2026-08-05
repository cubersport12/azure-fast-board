import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_BOARD_CARD_PRESET_ID,
  type BoardCardFieldId,
  type BoardCardFieldPreset,
} from '../../shared/types'
import { Button } from '@/components/ui/button'
import { Dialog, Input, Label } from '@/components/ui/primitives'
import { useSettings, useUpdateSettings } from '@/hooks/use-azure'
import { BOARD_CARD_FIELD_OPTIONS } from '@/lib/board-card-presets'
import { cn } from '@/lib/utils'

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `card-preset-${Date.now()}`
}

function EditorDialog({
  open,
  title,
  initialName,
  initialFields,
  confirmLabel,
  nameLocked,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  initialName: string
  initialFields: BoardCardFieldId[]
  confirmLabel: string
  nameLocked?: boolean
  onClose: () => void
  onSave: (name: string, fields: BoardCardFieldId[]) => void
}) {
  const [name, setName] = useState(initialName)
  const [fields, setFields] = useState<Set<BoardCardFieldId>>(new Set(initialFields))

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setFields(new Set(initialFields))
  }, [open, initialName, initialFields])

  const toggle = (id: BoardCardFieldId) => {
    setFields((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          const next = name.trim()
          if (!next) return
          onSave(next, [...fields])
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="board-card-preset-name">Название</Label>
          <Input
            id="board-card-preset-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Компактный"
            autoFocus={!nameLocked}
            disabled={nameLocked}
          />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Поля на плитке
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {BOARD_CARD_FIELD_OPTIONS.map((opt) => (
              <label
                key={opt.id}
                className="flex items-center gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-sm dark:border-slate-800"
              >
                <input
                  type="checkbox"
                  checked={fields.has(opt.id)}
                  onChange={() => toggle(opt.id)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
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

export function BoardCardPresetBar() {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const presets = settings?.boardCardFieldPresets ?? []
  const activeId = settings?.activeBoardCardFieldPresetId || DEFAULT_BOARD_CARD_PRESET_ID
  const active = presets.find((p) => p.id === activeId) ?? null
  const isDefault = active?.id === DEFAULT_BOARD_CARD_PRESET_ID

  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const label = useMemo(() => {
    if (!active) return 'По умолчанию'
    return `Вид: ${active.name}`
  }, [active])

  const persist = (patch: {
    boardCardFieldPresets?: BoardCardFieldPreset[]
    activeBoardCardFieldPresetId?: string
  }) => void updateSettings.mutateAsync(patch)

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setOpen((v) => !v)}
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
        {active && (
          <>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Редактировать вид"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {!isDefault && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Удалить вид"
                onClick={() => {
                  if (!confirm(`Удалить вид «${active.name}»?`)) return
                  persist({
                    boardCardFieldPresets: presets.filter((p) => p.id !== active.id),
                    activeBoardCardFieldPresetId: DEFAULT_BOARD_CARD_PRESET_ID,
                  })
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        )}
      </div>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[220px] rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={cn(
                'flex w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-900',
                preset.id === activeId && 'font-medium text-sky-700 dark:text-sky-300',
              )}
              onClick={() => {
                persist({ activeBoardCardFieldPresetId: preset.id })
                setOpen(false)
              }}
            >
              {preset.name}
            </button>
          ))}
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <button
            type="button"
            className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-sm text-sky-700 hover:bg-slate-50 dark:text-sky-300 dark:hover:bg-slate-900"
            onClick={() => {
              setOpen(false)
              setCreateOpen(true)
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Создать…
          </button>
        </div>
      )}

      <EditorDialog
        open={createOpen}
        title="Вид полей плитки"
        initialName=""
        initialFields={[]}
        confirmLabel="Создать"
        onClose={() => setCreateOpen(false)}
        onSave={(name, fields) => {
          const preset: BoardCardFieldPreset = { id: newId(), name, fields }
          persist({
            boardCardFieldPresets: [...presets, preset],
            activeBoardCardFieldPresetId: preset.id,
          })
          setCreateOpen(false)
        }}
      />

      <EditorDialog
        open={editOpen}
        title="Редактировать вид"
        initialName={active?.name ?? ''}
        initialFields={active?.fields ?? []}
        confirmLabel="Сохранить"
        nameLocked={isDefault}
        onClose={() => setEditOpen(false)}
        onSave={(name, fields) => {
          if (!active) return
          if (isDefault) {
            persist({
              boardCardFieldPresets: [
                { id: DEFAULT_BOARD_CARD_PRESET_ID, name: active.name, fields },
                ...presets.filter((p) => p.id !== DEFAULT_BOARD_CARD_PRESET_ID),
              ],
            })
          } else {
            persist({
              boardCardFieldPresets: presets.map((p) =>
                p.id === active.id ? { ...p, name, fields } : p,
              ),
            })
          }
          setEditOpen(false)
        }}
      />
    </div>
  )
}
