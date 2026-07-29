import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PendingImageStrip } from '@/components/pending-image-strip'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Badge, Dialog, Input, Label, Textarea } from '@/components/ui/primitives'
import {
  useAreaPaths,
  useAssignees,
  useConnection,
  useCreateWorkItem,
  useIterationPaths,
  useSettings,
  useUpdateSettings,
  useWorkItems,
  useWorkItemTypes,
} from '@/hooks/use-azure'
import {
  extractImageFromClipboardEvent,
  toPendingImage,
  type PendingImage,
} from '@/lib/clipboard-image'
import { requireAzureApi } from '@/lib/azure-api'
import { uniqueOptions } from '@/lib/work-item-filters'
import type { AssigneeIdentity, WorkItem, WorkItemTypeInfo } from '../../../shared/types'
import { useUiStore } from '@/stores/ui-store'

const EMPTY_TYPES: WorkItemTypeInfo[] = []
const EMPTY_ASSIGNEES: AssigneeIdentity[] = []
const EMPTY_WORK_ITEMS: WorkItem[] = []

function assigneeValue(person: AssigneeIdentity) {
  return person.uniqueName || person.displayName
}

export function QuickCreateDialog({ defaultColumn }: { defaultColumn?: string }) {
  const open = useUiStore((s) => s.quickCreateOpen)
  const setOpen = useUiStore((s) => s.setQuickCreateOpen)
  const { data: types = EMPTY_TYPES } = useWorkItemTypes()
  const { data: connection } = useConnection()
  const { data: teamAssignees = EMPTY_ASSIGNEES } = useAssignees()
  const { data: areaPaths } = useAreaPaths()
  const { data: iterationPaths } = useIterationPaths()
  const { data: settings } = useSettings()
  const { data: workItems = EMPTY_WORK_ITEMS } = useWorkItems()
  const create = useCreateWorkItem()
  const updateSettings = useUpdateSettings()
  const [type, setType] = useState('Bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [areaPath, setAreaPath] = useState('')
  const [iterationPath, setIterationPath] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [extraTags, setExtraTags] = useState<string[]>([])
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

  const knownTags = useMemo(() => {
    const fromItems = uniqueOptions(workItems).tags
    return [...new Set([...fromItems, ...extraTags])].sort((a, b) => a.localeCompare(b))
  }, [workItems, extraTags])

  const tagOptions = useMemo(
    () =>
      knownTags
        .filter((tag) => !tags.some((selected) => selected.toLowerCase() === tag.toLowerCase()))
        .map((tag) => ({ value: tag, label: tag })),
    [knownTags, tags],
  )

  const addTag = useCallback((tag: string) => {
    const next = tag.trim()
    if (!next) return
    setTags((current) =>
      current.some((entry) => entry.toLowerCase() === next.toLowerCase())
        ? current
        : [...current, next],
    )
    setExtraTags((current) =>
      current.some((entry) => entry.toLowerCase() === next.toLowerCase())
        ? current
        : [...current, next],
    )
  }, [])

  const defaultAssignee = useMemo(() => settings?.lastAssignee ?? '', [settings?.lastAssignee])
  const selectedIteration = settings?.selectedIterationPath?.trim() || ''

  const iterationOptions = useMemo(() => {
    const fromApi = iterationPaths?.iterations ?? []
    const fromSubscribed = settings?.subscribedIterations ?? []
    const byPath = new Map<string, { value: string; label: string }>()
    for (const entry of fromSubscribed) {
      byPath.set(entry.path.toLowerCase(), { value: entry.path, label: entry.name })
    }
    for (const entry of fromApi) {
      const key = entry.path.toLowerCase()
      if (!byPath.has(key)) byPath.set(key, { value: entry.path, label: entry.name })
    }
    if (selectedIteration && !byPath.has(selectedIteration.toLowerCase())) {
      byPath.set(selectedIteration.toLowerCase(), {
        value: selectedIteration,
        label: selectedIteration.split('\\').pop() || selectedIteration,
      })
    }
    return [...byPath.values()].sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  }, [iterationPaths?.iterations, settings?.subscribedIterations, selectedIteration])

  useEffect(() => {
    if (open) {
      setTitle('')
      setDescription('')
      setAssignedTo(defaultAssignee)
      setAreaPath(defaultAreaPath || rootPath)
      setIterationPath(selectedIteration)
      setTags([])
      setExtraTags([])
      setImages([])
      setType(types.find((entry) => entry.name === 'Bug')?.name || types[0]?.name || 'Bug')
      setPeople(teamAssignees)
      requestAnimationFrame(() => {
        document.getElementById('quick-create-title')?.focus()
      })
    }
  }, [open, types, defaultAssignee, defaultAreaPath, rootPath, teamAssignees, selectedIteration])

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
    const nextAssignee = assignedTo.trim()
    await create.mutateAsync({
      type,
      title: title.trim(),
      description: description.trim() || undefined,
      assignedTo: nextAssignee || undefined,
      areaPath: areaPath.trim() || undefined,
      iterationPath: iterationPath.trim() || undefined,
      tags: tags.length ? tags : undefined,
      boardColumn: defaultColumn,
      attachments: images.map(({ fileName, mimeType, dataBase64 }) => ({
        fileName,
        mimeType,
        dataBase64,
      })),
    })
    void updateSettings.mutateAsync({ lastAssignee: nextAssignee })
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
            <Label htmlFor="quick-create-iteration">Итерация</Label>
            <SearchableSelect
              id="quick-create-iteration"
              value={iterationPath}
              options={iterationOptions}
              onChange={setIterationPath}
              placeholder="Не выбрано"
              emptyLabel="Не выбрано"
              searchPlaceholder="Поиск итерации…"
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
              allowEmpty
            />
          </div>
          <div className="space-y-1 col-span-2">
            <Label htmlFor="quick-create-tags">Тэг</Label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-1">
                {tags.map((tag) => (
                  <Badge key={tag} className="gap-1 pr-1">
                    {tag}
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                      aria-label={`Удалить тэг ${tag}`}
                      onClick={() => setTags((current) => current.filter((entry) => entry !== tag))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <SearchableSelect
              id="quick-create-tags"
              value=""
              options={tagOptions}
              onChange={(next) => {
                if (next) addTag(next)
              }}
              onCreate={addTag}
              placeholder="Добавить тэг"
              emptyLabel="Без тэга"
              searchPlaceholder="Поиск тэга…"
              suggestionsLabel="Suggestions"
              createLabel="Создать новый тэг"
              allowEmpty={false}
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
