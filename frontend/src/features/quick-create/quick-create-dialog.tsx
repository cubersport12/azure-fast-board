import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RichTextEditor, isRichTextEmpty } from '@/components/rich-text-editor'
import { Dropdown } from '@/components/ui/dropdown'
import { Badge, Dialog, Input, Label } from '@/components/ui/primitives'
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
import { requireAzureApi } from '@/lib/azure-api'
import { uniqueOptions } from '@/lib/work-item-filters'
import {
  ADO_FIELD_DESCRIPTION,
  ADO_FIELD_REPRO_STEPS,
  type AssigneeIdentity,
  type AttachmentUpload,
  type WorkItem,
  type WorkItemTypeInfo,
} from '../../../shared/types'
import { useUiStore } from '@/stores/ui-store'

const EMPTY_TYPES: WorkItemTypeInfo[] = []
const EMPTY_ASSIGNEES: AssigneeIdentity[] = []
const EMPTY_WORK_ITEMS: WorkItem[] = []

function assigneeValue(person: AssigneeIdentity) {
  return person.uniqueName || person.displayName
}

function isBugType(type: string) {
  return /bug/i.test(type)
}

function stripBlobImages(html: string) {
  return html.replace(/<img\b[^>]*\bsrc=["']blob:[^"']*["'][^>]*>/gi, '')
}

function extractBlobSrcs(html: string) {
  const out: string[] = []
  const re = /<img\b[^>]*\bsrc=["'](blob:[^"']+)["']/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html || ''))) {
    if (match[1] && !out.includes(match[1])) out.push(match[1])
  }
  return out
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
  const [bodyHtml, setBodyHtml] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [areaPath, setAreaPath] = useState('')
  const [iterationPath, setIterationPath] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [extraTags, setExtraTags] = useState<string[]>([])
  const [people, setPeople] = useState<AssigneeIdentity[]>([])
  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const searchTimer = useRef<number | null>(null)
  const pendingUploads = useRef(new Map<string, AttachmentUpload>())
  const blobUrls = useRef<string[]>([])

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
      setBodyHtml('')
      setAssignedTo(defaultAssignee)
      setAreaPath(defaultAreaPath || rootPath)
      setIterationPath(selectedIteration)
      setTags([])
      setExtraTags([])
      setType(types.find((entry) => entry.name === 'Bug')?.name || types[0]?.name || 'Bug')
      setPeople(teamAssignees)
      setSubmitting(false)
      for (const url of blobUrls.current) URL.revokeObjectURL(url)
      blobUrls.current = []
      pendingUploads.current.clear()
      requestAnimationFrame(() => {
        document.getElementById('quick-create-title')?.focus()
      })
    }
  }, [open, types, defaultAssignee, defaultAreaPath, rootPath, teamAssignees, selectedIteration])

  useEffect(() => {
    return () => {
      if (searchTimer.current != null) window.clearTimeout(searchTimer.current)
      for (const url of blobUrls.current) URL.revokeObjectURL(url)
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

  const bugBody = isBugType(type)
  const bodyField = bugBody ? ADO_FIELD_REPRO_STEPS : ADO_FIELD_DESCRIPTION

  const onUploadImage = useCallback(async (file: AttachmentUpload) => {
    const binary = Uint8Array.from(atob(file.dataBase64), (c) => c.charCodeAt(0))
    const blob = new Blob([binary], { type: file.mimeType || 'image/png' })
    const blobUrl = URL.createObjectURL(blob)
    blobUrls.current.push(blobUrl)
    pendingUploads.current.set(blobUrl, file)
    return blobUrl
  }, [])

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault()
    if (!title.trim() || submitting) return
    setSubmitting(true)
    try {
      const nextAssignee = assignedTo.trim()
      const html = bodyHtml.trim()
      const textOnly = stripBlobImages(html).trim()
      const hasBody = !isRichTextEmpty(textOnly) || extractBlobSrcs(html).length > 0

      const created = await create.mutateAsync({
        type,
        title: title.trim(),
        description: !bugBody && textOnly ? textOnly : undefined,
        fields:
          bugBody && textOnly
            ? { [ADO_FIELD_REPRO_STEPS]: textOnly }
            : undefined,
        assignedTo: nextAssignee || undefined,
        areaPath: areaPath.trim() || undefined,
        iterationPath: iterationPath.trim() || undefined,
        tags: tags.length ? tags : undefined,
        boardColumn: defaultColumn,
      })

      const blobSrcs = extractBlobSrcs(html)
      let finalHtml = html
      let rev = created.rev
      const api = requireAzureApi()

      if (blobSrcs.length > 0) {
        for (const blobUrl of blobSrcs) {
          const file = pendingUploads.current.get(blobUrl)
          if (!file) continue
          const detail = await api.uploadAttachment(created.id, file)
          rev = detail.rev
          const latest = detail.attachments[detail.attachments.length - 1]
          if (latest?.url) finalHtml = finalHtml.split(blobUrl).join(latest.url)
          URL.revokeObjectURL(blobUrl)
          pendingUploads.current.delete(blobUrl)
        }
        blobUrls.current = blobUrls.current.filter((url) => !blobSrcs.includes(url))

        if (hasBody && finalHtml.trim()) {
          await api.updateWorkItem({
            id: created.id,
            rev,
            fields: { [bodyField]: finalHtml },
          })
        }
      }

      void updateSettings.mutateAsync({ lastAssignee: nextAssignee })
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Быстрое создание" wide>
      <form className="flex max-h-[calc(100vh-12rem)] flex-col" onSubmit={submit}>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
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
              <Dropdown
                id="quick-create-area"
                favoritesKey="quick-create-area"
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
              <Dropdown
                id="quick-create-iteration"
                favoritesKey="quick-create-iteration"
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
              <Dropdown
                id="quick-create-assigned"
                favoritesKey="quick-create-assigned"
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
              <Dropdown
                id="quick-create-tags"
                favoritesKey="quick-create-tags"
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
            <Label>{bugBody ? 'Шаги воспроизведения' : 'Описание'}</Label>
            <RichTextEditor
              key={`create-${open ? 'open' : 'closed'}-${type}`}
              value={bodyHtml}
              onChange={setBodyHtml}
              onUploadImage={onUploadImage}
              placeholder={
                bugBody
                  ? 'Steps to Reproduce… Ctrl+V — скриншот'
                  : 'Текст описания… Ctrl+V — скриншот'
              }
              minHeight={140}
              maxHeight={220}
              data-composer="create"
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between border-t border-slate-100 pt-3 mt-3 dark:border-slate-800">
          <span className="text-[11px] text-slate-500">
            Ctrl+V — скриншот · Esc — закрыть
          </span>
          <Button type="submit" disabled={!title.trim() || submitting || create.isPending}>
            {submitting || create.isPending ? 'Создание…' : 'Создать'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
