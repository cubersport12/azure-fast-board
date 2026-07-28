import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PendingImageStrip } from '@/components/pending-image-strip'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Dialog, Input, Label, Textarea } from '@/components/ui/primitives'
import {
  useAreaPaths,
  useAssignees,
  useConnection,
  useCreateWorkItem,
  useWorkItemTypes,
} from '@/hooks/use-azure'
import {
  extractImageFromClipboardEvent,
  toPendingImage,
  type PendingImage,
} from '@/lib/clipboard-image'
import { requireAzureApi } from '@/lib/azure-api'
import type { AssigneeIdentity } from '../../../shared/types'
import { useUiStore } from '@/stores/ui-store'

function assigneeValue(person: AssigneeIdentity) {
  return person.uniqueName || person.displayName
}

function normalizeIdentity(value: string) {
  const raw = value.trim().toLowerCase()
  const afterDomain = raw.includes('\\') ? raw.slice(raw.lastIndexOf('\\') + 1) : raw
  return afterDomain.includes('@') ? afterDomain.slice(0, afterDomain.indexOf('@')) : afterDomain
}

export function QuickCreateDialog({ defaultColumn }: { defaultColumn?: string }) {
  const open = useUiStore((s) => s.quickCreateOpen)
  const setOpen = useUiStore((s) => s.setQuickCreateOpen)
  const { data: types = [] } = useWorkItemTypes()
  const { data: connection } = useConnection()
  const { data: teamAssignees = [] } = useAssignees()
  const { data: areaPaths } = useAreaPaths()
  const create = useCreateWorkItem()
  const [type, setType] = useState('Bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [areaPath, setAreaPath] = useState('')
  const [images, setImages] = useState<PendingImage[]>([])
  const [people, setPeople] = useState<AssigneeIdentity[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef<number | null>(null)

  useEffect(() => {
    setPeople(teamAssignees)
  }, [teamAssignees])

  const areas = areaPaths?.areas ?? []
  const rootPath = areaPaths?.rootPath || connection?.project || ''
  const defaultAreaPath = areaPaths?.defaultPath || rootPath

  const defaultAssignee = useMemo(() => {
    const username = connection?.username?.trim()
    if (!username) return ''
    const me = normalizeIdentity(username)
    const match = teamAssignees.find((person) => {
      const candidates = [person.uniqueName, person.displayName].filter(Boolean) as string[]
      return candidates.some((candidate) => normalizeIdentity(candidate) === me)
    })
    return match ? assigneeValue(match) : username
  }, [connection?.username, teamAssignees])

  useEffect(() => {
    if (open) {
      setTitle('')
      setDescription('')
      setAssignedTo(defaultAssignee)
      setAreaPath(defaultAreaPath || rootPath)
      setImages([])
      setType(types.find((entry) => entry.name === 'Bug')?.name || types[0]?.name || 'Bug')
      setPeople(teamAssignees)
      requestAnimationFrame(() => {
        document.getElementById('quick-create-title')?.focus()
      })
    }
  }, [open, types, defaultAssignee, defaultAreaPath, rootPath, teamAssignees])

  useEffect(() => {
    if (!open) return

    const onPaste = async (event: ClipboardEvent) => {
      const image = await extractImageFromClipboardEvent(event)
      if (!image) return
      event.preventDefault()
      setImages((current) => [...current, toPendingImage(image)])
    }

    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open])

  useEffect(() => {
    return () => {
      if (searchTimer.current != null) window.clearTimeout(searchTimer.current)
    }
  }, [])

  const handleSearch = useCallback(
    (query: string) => {
      const q = query.trim()
      if (searchTimer.current != null) window.clearTimeout(searchTimer.current)

      if (q.length < 2) {
        setPeople(teamAssignees)
        setSearching(false)
        return
      }

      setSearching(true)
      searchTimer.current = window.setTimeout(() => {
        void requireAzureApi()
          .searchAssignees(q)
          .then((results) => {
            setPeople(results.length ? results : teamAssignees)
          })
          .catch(() => {
            setPeople(teamAssignees)
          })
          .finally(() => setSearching(false))
      }, 250)
    },
    [teamAssignees],
  )

  const options = useMemo(() => {
    const mapped = people.map((person) => ({
      value: assigneeValue(person),
      label: person.displayName,
      description: person.uniqueName,
    }))
    if (assignedTo && !mapped.some((option) => option.value === assignedTo)) {
      mapped.unshift({ value: assignedTo, label: assignedTo, description: undefined })
    }
    return mapped
  }, [people, assignedTo])

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault()
    if (!title.trim()) return
    await create.mutateAsync({
      type,
      title: title.trim(),
      description: description.trim() || undefined,
      assignedTo: assignedTo.trim() || undefined,
      areaPath: areaPath.trim() || undefined,
      boardColumn: defaultColumn,
      attachments: images.map(({ fileName, mimeType, dataBase64 }) => ({
        fileName,
        mimeType,
        dataBase64,
      })),
    })
    setOpen(false)
  }

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Быстрое создание">
      <form className="space-y-3" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="quick-create-type">Тип</Label>
            <select
              id="quick-create-type"
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {types.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="quick-create-area">Area</Label>
            <SearchableSelect
              id="quick-create-area"
              value={
                !areaPath || (rootPath && areaPath.toLowerCase() === rootPath.toLowerCase())
                  ? ''
                  : areaPath
              }
              options={areas
                .filter(
                  (area) =>
                    !rootPath || area.path.toLowerCase() !== rootPath.toLowerCase(),
                )
                .map((area) => ({
                  value: area.path,
                  label: area.name,
                }))}
              onChange={(next) => setAreaPath(next || rootPath)}
              placeholder="Не указано"
              emptyLabel="Не указано"
              searchPlaceholder="Поиск Area…"
              suggestionsLabel="Suggestions"
              allowEmpty
            />
          </div>
          <div className="space-y-1 col-span-2">
            <Label htmlFor="quick-create-assigned">Исполнитель</Label>
            <SearchableSelect
              id="quick-create-assigned"
              value={assignedTo}
              options={options}
              onChange={setAssignedTo}
              onSearch={handleSearch}
              placeholder="Не назначен"
              emptyLabel="Не назначен"
              searchPlaceholder={searching ? 'Поиск…' : 'Найти человека…'}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="quick-create-title">Название</Label>
          <Input
            id="quick-create-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Что нужно сделать?"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="quick-create-description">Описание</Label>
          <Textarea
            id="quick-create-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Необязательные детали · Ctrl+V — скриншот"
          />
        </div>
        <PendingImageStrip
          images={images}
          onRemove={(id) => setImages((current) => current.filter((image) => image.id !== id))}
        />
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-slate-500">
            Ctrl+V — скриншот · Enter — создать · Esc — закрыть
          </span>
          <Button type="submit" disabled={!title.trim() || create.isPending}>
            {create.isPending ? 'Создание…' : 'Создать'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
