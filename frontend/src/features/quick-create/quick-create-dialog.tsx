import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, FileText, Flag, Folder, Plus, Tag, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RichTextEditor, isRichTextEmpty } from '@/components/rich-text-editor'
import { Dropdown } from '@/components/ui/dropdown'
import { TagsField } from '@/components/tags-field'
import { Dialog, Input, Label } from '@/components/ui/primitives'
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
import { cn, workItemColor } from '@/lib/utils'
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
  const [priority, setPriority] = useState('')
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

  const onTagsChange = useCallback((next: string[]) => {
    setTags(next)
    setExtraTags((current) => {
      const merged = new Set(current.map((t) => t.toLowerCase()))
      const out = [...current]
      for (const tag of next) {
        if (!merged.has(tag.toLowerCase())) {
          out.push(tag)
          merged.add(tag.toLowerCase())
        }
      }
      return out
    })
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

  const typeOptions = useMemo(() => {
    return types.map((entry) => ({
      value: entry.name,
      label: entry.name,
    }))
  }, [types])

  useEffect(() => {
    if (open) {
      setTitle('')
      setBodyHtml('')
      setAssignedTo(defaultAssignee)
      setAreaPath(defaultAreaPath || rootPath)
      setIterationPath(selectedIteration)
      setTags([])
      setExtraTags([])
      setPriority('')
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

  const assigneeOptions = useMemo(() => {
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

      const extraFields: Record<string, string | number | boolean | null> = {}
      if (bugBody && textOnly) extraFields[ADO_FIELD_REPRO_STEPS] = textOnly
      if (priority) extraFields['Microsoft.VSTS.Common.Priority'] = Number(priority)

      const created = await create.mutateAsync({
        type,
        title: title.trim(),
        description: !bugBody && textOnly ? textOnly : undefined,
        fields: Object.keys(extraFields).length ? extraFields : undefined,
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
      <form className="flex max-h-[calc(100vh-10rem)] flex-col" onSubmit={submit}>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {/* Main Title Field */}
          <div className="space-y-1.5">
            <Label htmlFor="quick-create-title" className="text-xs font-semibold text-foreground">
              Название
            </Label>
            <Input
              id="quick-create-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Что нужно сделать или какой баг возник?"
              className="h-10 text-sm font-medium"
              autoFocus
            />
          </div>

          {/* Type & Priority Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quick-create-type" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('h-2 w-2 rounded-full', workItemColor(type))} /> Тип элемента
              </Label>
              <Dropdown
                id="quick-create-type"
                value={type}
                options={typeOptions}
                onChange={setType}
                searchable={false}
                allowEmpty={false}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quick-create-priority" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Flag className="h-3.5 w-3.5 text-primary/70" /> Приоритет
              </Label>
              <Dropdown
                id="quick-create-priority"
                value={priority}
                options={[
                  { value: '1', label: '1 — Высочайший (P1)' },
                  { value: '2', label: '2 — Высокий (P2)' },
                  { value: '3', label: '3 — Средний (P3)' },
                  { value: '4', label: '4 — Низкий (P4)' },
                ]}
                onChange={setPriority}
                placeholder="Не указано"
                emptyLabel="Не указано"
                searchable={false}
                allowEmpty
              />
            </div>
          </div>

          {/* Attributes Grid (Assignee, Iteration, Area, Tags) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="quick-create-assigned" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3.5 w-3.5 text-primary/70" /> Исполнитель
              </Label>
              <Dropdown
                id="quick-create-assigned"
                favoritesKey="quick-create-assigned"
                value={assignedTo}
                options={assigneeOptions}
                onChange={setAssignedTo}
                onSearch={handleSearch}
                placeholder="Не назначен"
                emptyLabel="Не назначен"
                searchPlaceholder={searching ? 'Поиск…' : 'Найти человека…'}
                allowEmpty
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quick-create-iteration" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 text-primary/70" /> Итерация (Sprint)
              </Label>
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

            <div className="space-y-1.5">
              <Label htmlFor="quick-create-area" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Folder className="h-3.5 w-3.5 text-primary/70" /> Область (Area)
              </Label>
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
                onChange={(next) => setAreaPath(next || rootPath || '')}
                placeholder="Не указано"
                emptyLabel="Не указано"
                searchPlaceholder="Поиск Area…"
                suggestionsLabel="Suggestions"
                allowEmpty
              />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Tag className="h-3.5 w-3.5 text-primary/70" /> Теги
              </Label>
              <TagsField
                id="quick-create-tags"
                value={tags}
                options={knownTags}
                onChange={onTagsChange}
                placeholder="Добавить тэг"
              />
            </div>
          </div>

          {/* Description / Repro Steps Field */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5 text-primary/70" />
              {bugBody ? 'Шаги воспроизведения' : 'Описание'}
            </Label>
            <RichTextEditor
              key={`create-${open ? 'open' : 'closed'}-${type}`}
              value={bodyHtml}
              onChange={setBodyHtml}
              onUploadImage={onUploadImage}
              placeholder={
                bugBody
                  ? 'Опишите шаги для воспроизведения бага… Ctrl+V — скриншот'
                  : 'Текст описания задачи… Ctrl+V — скриншот'
              }
              minHeight={130}
              maxHeight={200}
              data-composer="create"
            />
          </div>
        </div>

        {/* Dialog Footer Actions */}
        <div className="flex shrink-0 items-center justify-between border-t border-border pt-3 mt-4">
          <span className="text-[11px] text-muted-foreground">
            Ctrl+V — вставка скриншота · Esc — закрыть
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!title.trim() || submitting || create.isPending}
              className="gap-1.5 font-medium"
            >
              <Plus className="h-4 w-4" />
              {submitting || create.isPending ? 'Создание…' : 'Создать'}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}
