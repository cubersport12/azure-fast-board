import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Flag,
  Folder,
  Layers,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Tag,
  User,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AuthenticatedHtml } from '@/components/authenticated-media'
import { RichTextEditor, htmlPlainText, isRichTextEmpty } from '@/components/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Badge, Card, Input, Label } from '@/components/ui/primitives'
import { Dropdown } from '@/components/ui/dropdown'
import { TagsField } from '@/components/tags-field'
import { SendToMattermostButton } from '@/features/mattermost/send-to-mattermost-button'
import {
  queryKeys,
  useAreaPaths,
  useAssignees,
  useConnection,
  useIterationPaths,
  useSettings,
  useUpdateWorkItem,
  useWorkItem,
  useWorkItems,
  useWorkItemTypes,
} from '@/hooks/use-azure'
import { getAzureApi, requireAzureApi } from '@/lib/azure-api'
import { renderCommentHtml } from '@/lib/clipboard-image'
import { descriptionImageUrls, mediaUrlsMatch } from '@/lib/html-text'
import { notificationBelongsToWorkItem } from '@/lib/notification-route'
import { uniqueOptions } from '@/lib/work-item-filters'
import { cn, formatRelative, workItemColor } from '@/lib/utils'
import { useNotificationsStore } from '@/stores/notifications-store'
import {
  ADO_FIELD_DESCRIPTION,
  ADO_FIELD_REPRO_STEPS,
  type AssigneeIdentity,
  type AttachmentUpload,
  type BoardNotification,
  type WorkItem,
} from '../../../shared/types'
import { buildWorkItemWebUrl } from '../../../shared/utils'

const EMPTY_ASSIGNEES: AssigneeIdentity[] = []
const EMPTY_WORK_ITEMS: WorkItem[] = []

function assigneeValue(person: AssigneeIdentity) {
  return person.uniqueName || person.displayName
}

function bodyFieldForType(type: string) {
  return /bug/i.test(type) ? ADO_FIELD_REPRO_STEPS : ADO_FIELD_DESCRIPTION
}

function getInitials(name?: string) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export function WorkItemDetailPage() {
  const { id = '' } = useParams()
  const workItemId = Number(id)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightCommentId = Number(searchParams.get('commentId') || '')
  const { data, isLoading, refetch, isRefetching } = useWorkItem(workItemId)
  const { data: types = [] } = useWorkItemTypes()
  const { data: settings } = useSettings()
  const { data: connection } = useConnection()
  const { data: iterationPaths } = useIterationPaths()
  const { data: areaPaths } = useAreaPaths()
  const { data: teamAssignees = EMPTY_ASSIGNEES } = useAssignees()
  const { data: workItems = EMPTY_WORK_ITEMS } = useWorkItems()
  const update = useUpdateWorkItem()
  const qc = useQueryClient()
  const markReadByWorkItemId = useNotificationsStore((s) => s.markReadByWorkItemId)

  const [title, setTitle] = useState('')
  /** null = show server body; string = user/editor draft */
  const [bodyHtml, setBodyHtml] = useState<string | null>(null)
  const [iterationPath, setIterationPath] = useState('')
  const [areaPath, setAreaPath] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [extraTags, setExtraTags] = useState<string[]>([])
  const [priority, setPriority] = useState('')
  const [workItemType, setWorkItemType] = useState('')
  const [people, setPeople] = useState<AssigneeIdentity[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef<number | null>(null)
  const [comment, setComment] = useState('')
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [savingBody, setSavingBody] = useState(false)
  const [activeHighlightCommentId, setActiveHighlightCommentId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState(false)

  const selectedIteration = settings?.selectedIterationPath?.trim() || ''
  const areas = areaPaths?.areas ?? []
  const rootPath = areaPaths?.rootPath || connection?.project || ''
  const bodyField = bodyFieldForType(workItemType || data?.type || '')
  const isReproBody = bodyField === ADO_FIELD_REPRO_STEPS
  const serverBodyHtml = isReproBody ? (data?.reproSteps ?? '') : (data?.description ?? '')
  const displayBodyHtml =
    dirty && bodyHtml != null && htmlPlainText(bodyHtml).length > 0
      ? bodyHtml
      : serverBodyHtml

  useEffect(() => {
    setPeople(teamAssignees)
  }, [teamAssignees])

  const knownTags = useMemo(() => {
    const fromItems = uniqueOptions(workItems).tags
    const fromItem = data?.tags ?? []
    return [...new Set([...fromItems, ...fromItem, ...extraTags])].sort((a, b) =>
      a.localeCompare(b),
    )
  }, [workItems, data?.tags, extraTags])

  const onTagsChange = useCallback((next: string[]) => {
    setTags(next)
    setExtraTags((current) => {
      const merged = new Set(current.map((t) => t.toLowerCase()))
      for (const tag of next) {
        if (!merged.has(tag.toLowerCase())) current = [...current, tag]
      }
      return current
    })
    setDirty(true)
  }, [])

  const onAssigneeSearch = useCallback(
    (query: string) => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current)
      const q = query.trim()
      if (!q) {
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
      hint: person.uniqueName,
    }))
    if (assignedTo && !mapped.some((o) => o.value === assignedTo || o.label === assignedTo)) {
      mapped.unshift({ value: assignedTo, label: assignedTo, hint: assignedTo })
    }
    return mapped
  }, [people, assignedTo])

  // Opening a card means the user has seen related notifications — mark them read.
  useEffect(() => {
    if (!Number.isFinite(workItemId) || workItemId <= 0) return
    markReadByWorkItemId(workItemId)
    const api = getAzureApi()
    if (!api?.markNotificationsReadByWorkItem) return
    void api
      .markNotificationsReadByWorkItem(workItemId)
      .then((history: BoardNotification[]) => useNotificationsStore.getState().seed(history))
      .catch(() => undefined)
  }, [workItemId, markReadByWorkItemId])

  // New notification while this card is open → also mark read.
  useEffect(() => {
    if (!Number.isFinite(workItemId) || workItemId <= 0) return
    const api = getAzureApi()
    if (!api?.onNotification || !api.markNotificationsReadByWorkItem) return
    return api.onNotification((notification: BoardNotification) => {
      if (!notificationBelongsToWorkItem(notification, workItemId)) return
      markReadByWorkItemId(workItemId)
      void api
        .markNotificationsReadByWorkItem(workItemId)
        .then((history: BoardNotification[]) => useNotificationsStore.getState().seed(history))
        .catch(() => undefined)
    })
  }, [workItemId, markReadByWorkItemId])

  // Reset draft when navigating to another work item.
  useEffect(() => {
    setDirty(false)
    setBodyHtml(null)
    setTitle('')
    setIterationPath('')
    setAreaPath('')
    setAssignedTo('')
    setTags([])
    setExtraTags([])
    setPriority('')
    setWorkItemType('')
    setComment('')
    setStatus(null)
  }, [workItemId])

  useEffect(() => {
    if (!data || dirty) return
    setTitle(data.title)
    setBodyHtml(null)
    setIterationPath(data.iterationPath || '')
    setAreaPath(data.areaPath || '')
    setAssignedTo(data.assignedToUniqueName || data.assignedTo || '')
    setTags(data.tags ?? [])
    setPriority(data.priority != null ? String(data.priority) : '')
    setWorkItemType(data.type || '')
  }, [data, dirty, serverBodyHtml])

  useEffect(() => {
    if (!data || !Number.isFinite(highlightCommentId) || highlightCommentId <= 0) return

    const targetId = highlightCommentId
    let attempts = 0
    let done = false
    let pollTimer: number | null = null
    let clearTimer: number | null = null

    const finish = (found: boolean) => {
      if (done) return
      done = true
      if (pollTimer != null) {
        window.clearInterval(pollTimer)
        pollTimer = null
      }
      if (!found) {
        document.getElementById('wi-discussion')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      clearTimer = window.setTimeout(() => {
        setActiveHighlightCommentId((current) => (current === targetId ? null : current))
        setSearchParams(
          (prev: URLSearchParams) => {
            const next = new URLSearchParams(prev)
            next.delete('commentId')
            return next
          },
          { replace: true },
        )
      }, 4500)
    }

    const tryHighlight = () => {
      if (done) return
      attempts += 1
      const el = document.getElementById(`wi-comment-${targetId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setActiveHighlightCommentId(targetId)
        finish(true)
        return
      }
      if (attempts >= 12) finish(false)
    }

    tryHighlight()
    if (!done) pollTimer = window.setInterval(tryHighlight, 200)

    return () => {
      done = true
      if (pollTimer != null) window.clearInterval(pollTimer)
      if (clearTimer != null) window.clearTimeout(clearTimer)
    }
  }, [data, highlightCommentId, setSearchParams])

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
    for (const path of [iterationPath, data?.iterationPath, selectedIteration]) {
      const value = path?.trim()
      if (!value) continue
      const key = value.toLowerCase()
      if (!byPath.has(key)) {
        byPath.set(key, { value, label: value.split('\\').pop() || value })
      }
    }
    return [...byPath.values()].sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  }, [
    iterationPaths?.iterations,
    settings?.subscribedIterations,
    iterationPath,
    data?.iterationPath,
    selectedIteration,
  ])

  const availableStates = useMemo(() => {
    if (!data) return [] as string[]
    const typeName = workItemType || data.type
    const typeInfo = types.find((entry) => entry.name === typeName)
    const fromType = typeInfo?.states.map((entry) => entry.name) ?? []
    if (fromType.length) {
      return fromType.includes(data.state) ? fromType : [data.state, ...fromType]
    }
    return data.state ? [data.state] : []
  }, [data, types, workItemType])

  const addComment = useMutation({
    mutationFn: (text: string) =>
      requireAzureApi().addComment({
        id: workItemId,
        text,
      }),
    onSuccess: async () => {
      setComment('')
      await qc.invalidateQueries({ queryKey: queryKeys.workItem(workItemId) })
    },
  })

  const uploadInlineImage = useCallback(async (file: AttachmentUpload) => {
    const detail = await requireAzureApi().uploadAttachment(workItemId, file)
    const latest = detail.attachments[detail.attachments.length - 1]
    if (!latest?.url) throw new Error('Не удалось получить URL изображения')
    return latest.url
  }, [workItemId])

  const onBodyUpload = useCallback(
    async (file: AttachmentUpload) => {
      setStatus('Загрузка изображения…')
      try {
        const url = await uploadInlineImage(file)
        setDirty(true)
        setStatus('Изображение вставлено — нажмите «Сохранить»')
        return url
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Не удалось загрузить изображение')
        throw error
      }
    },
    [uploadInlineImage],
  )

  const onCommentUpload = useCallback(
    async (file: AttachmentUpload) => {
      setStatus('Загрузка изображения…')
      try {
        const url = await uploadInlineImage(file)
        setStatus('Изображение вставлено в комментарий')
        return url
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Не удалось загрузить изображение')
        throw error
      }
    },
    [uploadInlineImage],
  )

  const canSendComment = !isRichTextEmpty(comment)
  const draftBody = bodyHtml ?? serverBodyHtml
  const serverAssignee = (data?.assignedToUniqueName || data?.assignedTo || '').trim()
  const serverTags = (data?.tags ?? []).join('; ')
  const draftTags = tags.join('; ')
  const serverPriority = data?.priority != null ? String(data.priority) : ''

  const canSaveBody =
    dirty &&
    (title.trim() !== (data?.title ?? '') ||
      (bodyHtml != null && draftBody !== serverBodyHtml) ||
      iterationPath !== (data?.iterationPath || '') ||
      areaPath !== (data?.areaPath || '') ||
      assignedTo.trim() !== serverAssignee ||
      draftTags !== serverTags ||
      priority !== serverPriority ||
      workItemType !== (data?.type || ''))

  const handleCancel = () => {
    if (!data) return
    setTitle(data.title)
    setBodyHtml(null)
    setIterationPath(data.iterationPath || '')
    setAreaPath(data.areaPath || '')
    setAssignedTo(data.assignedToUniqueName || data.assignedTo || '')
    setTags(data.tags ?? [])
    setPriority(data.priority != null ? String(data.priority) : '')
    setWorkItemType(data.type || '')
    setDirty(false)
    setStatus(null)
  }

  const saveBody = async () => {
    if (!data || !canSaveBody) return
    setSavingBody(true)
    try {
      const fields: Record<string, string | number | boolean | null | undefined> = {}

      if (title.trim() !== (data.title ?? '')) {
        fields['System.Title'] = title.trim()
      }

      let bodySkippedImages = false
      const bodyChanged = bodyHtml != null && draftBody !== serverBodyHtml
      if (bodyChanged) {
        const previousUrls = descriptionImageUrls(serverBodyHtml)
        const nextUrls = descriptionImageUrls(draftBody)
        const keptAnyImage =
          previousUrls.size === 0 ||
          [...previousUrls].some((url) =>
            [...nextUrls].some((entry) => mediaUrlsMatch(entry, url)),
          )
        if (!keptAnyImage) {
          bodySkippedImages = true
        } else {
          for (const url of previousUrls) {
            if ([...nextUrls].some((entry) => mediaUrlsMatch(entry, url))) continue
            try {
              await requireAzureApi().removeAttachment(workItemId, url)
            } catch {
              // Continue saving even if relation cleanup fails.
            }
          }
          fields[bodyField] = draftBody
        }
      }

      const nextIteration = iterationPath.trim()
      const prevIteration = (data.iterationPath || '').trim()
      if (nextIteration !== prevIteration) {
        fields['System.IterationPath'] = nextIteration || null
      }

      const nextArea = areaPath.trim()
      const prevArea = (data.areaPath || '').trim()
      if (nextArea !== prevArea) {
        fields['System.AreaPath'] =
          !nextArea || (rootPath && nextArea.toLowerCase() === rootPath.toLowerCase())
            ? rootPath || null
            : nextArea
      }

      if (assignedTo.trim() !== serverAssignee) {
        fields['System.AssignedTo'] = assignedTo.trim() || null
      }
      if (draftTags !== serverTags) {
        fields['System.Tags'] = draftTags || null
      }
      if (priority !== serverPriority) {
        fields['Microsoft.VSTS.Common.Priority'] = priority ? Number(priority) : null
      }
      if (workItemType && workItemType !== data.type) {
        fields['System.WorkItemType'] = workItemType
      }

      if (!Object.keys(fields).length) {
        setDirty(false)
        setStatus('Нет изменений для сохранения')
        return
      }

      const fresh = await requireAzureApi().getWorkItem(workItemId)
      await update.mutateAsync({
        id: data.id,
        rev: fresh.rev,
        fields,
      })
      setDirty(false)
      setStatus(
        bodySkippedImages
          ? 'Сохранено (описание не обновлено — пропали картинки)'
          : 'Сохранено',
      )
      await qc.invalidateQueries({ queryKey: queryKeys.workItem(workItemId) })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось сохранить')
    } finally {
      setSavingBody(false)
    }
  }

  const openAzure = async () => {
    if (!connection || !data) return
    const url = data.url?.includes('_workitems')
      ? data.url
      : buildWorkItemWebUrl(connection, data.id)
    await getAzureApi()?.openExternal(url)
  }

  const changeState = async (state: string) => {
    if (!data || state === data.state) return
    try {
      await update.mutateAsync({
        id: data.id,
        rev: data.rev,
        fields: { 'System.State': state },
      })
      setStatus(`Состояние: ${state}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось сменить состояние')
    }
  }

  const copyId = () => {
    if (!data) return
    void navigator.clipboard.writeText(String(data.id))
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center p-6 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Загрузка рабочего элемента #{workItemId}…
      </div>
    )
  }

  const activeType = workItemType || data.type

  return (
    <div className="flex min-h-full flex-col bg-muted/20">
      {/* Sticky Action Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-2.5 shadow-xs backdrop-blur-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          {/* Left Navigation & Identifiers */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" /> Назад
            </Button>
            <div className="h-4 w-px bg-border" />

            {/* Type selector */}
            <div className="flex items-center gap-1.5">
              <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', workItemColor(activeType))} />
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring"
                value={activeType}
                disabled={update.isPending || types.length === 0}
                onChange={(event) => {
                  setWorkItemType(event.target.value)
                  setDirty(true)
                }}
                aria-label="Тип рабочего элемента"
              >
                {types.map((entry) => (
                  <option key={entry.name} value={entry.name}>
                    {entry.name}
                  </option>
                ))}
                {workItemType && !types.some((entry) => entry.name === workItemType) && (
                  <option value={workItemType}>{workItemType}</option>
                )}
              </select>
            </div>

            {/* State selector */}
            <select
              className="h-8 rounded-lg border border-primary/30 bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-ring"
              value={data.state}
              disabled={update.isPending || availableStates.length === 0}
              onChange={(event) => void changeState(event.target.value)}
              aria-label="Состояние"
            >
              {availableStates.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>

          {/* Right Header Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {status && (
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 animate-fade-in">
                {status}
              </span>
            )}

            {/* Work Item ID Badge */}
            <Button
              className="ml-auto"
              type="button"
              variant="outline"
              size="sm"
              onClick={copyId}
              title="Скопировать ID"
            >
              {copiedId ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copiedId ? 'Скопировано' : `#${data.id}`}
            </Button>

            {canSaveBody && (
              <div className="flex items-center gap-1.5 bg-amber-500/10 dark:bg-amber-500/20 px-2 py-1 rounded-lg border border-amber-500/30">
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300 hidden sm:inline">
                  Есть изменения
                </span>
                <Button variant="ghost" size="xs" onClick={handleCancel} title="Сбросить несохранённые изменения">
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Отмена
                </Button>
                <Button
                  size="xs"
                  disabled={savingBody}
                  onClick={() => void saveBody()}
                  className="bg-primary text-primary-foreground font-medium shadow-xs"
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {savingBody ? 'Сохранение…' : 'Сохранить'}
                </Button>
              </div>
            )}

            <SendToMattermostButton workItemId={data.id} />

            <Button variant="outline" size="sm" onClick={() => void openAzure()} title="Открыть в Azure DevOps" className="gap-1.5 text-xs">
              <ExternalLink className="h-3.5 w-3.5" />
              Azure
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void refetch()}
              disabled={isRefetching}
              title="Обновить данные карточки"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isRefetching && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 p-4 md:p-6">
        <div className="grid w-full gap-6 lg:grid-cols-12">
          {/* Main Column (Title, Description, Discussion) */}
          <div className="space-y-6 lg:col-span-8">
            {/* Title & Metadata Card */}
            <Card className="p-5 shadow-xs border-border bg-card">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="work-item-detail-title" className="text-xs text-muted-foreground">
                    Название
                  </Label>
                  <Input
                    id="work-item-detail-title"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value)
                      setDirty(true)
                    }}
                    placeholder="Введите название…"
                    className="h-auto min-h-11 py-2.5 text-lg font-semibold md:text-xl"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-t border-border/50 pt-3">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 opacity-70" />
                    Изменено {formatRelative(data.changedDate)}
                  </span>
                  {data.createdBy && (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3.5 w-3.5 opacity-70" />
                      Автор: <strong className="font-medium text-foreground/90">{data.createdBy}</strong>
                    </span>
                  )}
                  {data.createdDate && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 opacity-70" />
                      Создано {formatRelative(data.createdDate)}
                    </span>
                  )}
                </div>
              </div>
            </Card>

            {/* Description / Repro Steps Card */}
            <Card className="p-5 shadow-xs border-border bg-card space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">
                    {isReproBody ? 'Шаги воспроизведения' : 'Описание'}
                  </h2>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Поддерживается форматирование и вставка скриншотов (Ctrl+V)
                </span>
              </div>

              <RichTextEditor
                key={String(workItemId)}
                value={displayBodyHtml}
                onChange={(html) => {
                  if (htmlPlainText(html).length < htmlPlainText(serverBodyHtml).length) {
                    return
                  }
                  setBodyHtml(html)
                  if (html !== serverBodyHtml) setDirty(true)
                }}
                onUploadImage={onBodyUpload}
                placeholder={
                  isReproBody
                    ? 'Опишите шаги для воспроизведения бага… Ctrl+V для вставки скриншота'
                    : 'Текст описания задачи… Ctrl+V для вставки скриншота'
                }
                minHeight={200}
                data-composer="body"
              />

              {/* {canSaveBody && (
                <div className="flex justify-end pt-2">
                  <Button disabled={savingBody} onClick={() => void saveBody()} size="sm">
                    <Save className="h-4 w-4 mr-1.5" />
                    {savingBody ? 'Сохранение…' : 'Сохранить изменения'}
                  </Button>
                </div>
              )} */}
            </Card>

            {/* Discussion / Comments Card */}
            <Card id="wi-discussion" className="p-5 shadow-xs border-border bg-card space-y-5">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">Обсуждение</h2>
                  <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
                    {data.comments.length}
                  </Badge>
                </div>
              </div>

              {/* Comment History List */}
              <div className="space-y-3.5 max-h-112 overflow-y-auto pr-1">
                {data.comments.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">
                    Комментариев пока нет. Напишите первый комментарий ниже.
                  </div>
                )}
                {data.comments.map((entry) => (
                  <div
                    key={entry.id}
                    id={`wi-comment-${entry.id}`}
                    className={cn(
                      'rounded-xl border p-4 transition-all duration-300',
                      activeHighlightCommentId === entry.id
                        ? 'border-amber-400/80 bg-amber-500/10 ring-2 ring-amber-400/50'
                        : 'border-border/60 bg-muted/20 hover:bg-muted/40',
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                          {getInitials(entry.createdBy)}
                        </div>
                        <span className="truncate text-xs font-semibold text-foreground">
                          {entry.createdBy}
                        </span>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRelative(entry.createdDate)}
                      </span>
                    </div>

                    <AuthenticatedHtml
                      className="max-w-none text-xs text-foreground/90 leading-relaxed [&_img]:mt-2 [&_img]:max-h-64 [&_img]:rounded-lg [&_img]:border [&_img]:border-border [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                      html={renderCommentHtml(entry.text)}
                    />
                  </div>
                ))}
              </div>

              {/* New Comment Composer */}
              <div className="space-y-2 border-t border-border/60 pt-4">
                <Label className="text-xs font-medium text-foreground">Новый комментарий</Label>
                <RichTextEditor
                  value={comment}
                  onChange={setComment}
                  onUploadImage={onCommentUpload}
                  placeholder="Написать комментарий… Вставляйте скриншоты по Ctrl+V"
                  minHeight={96}
                  data-composer="comment"
                />
                <div className="flex justify-end pt-1">
                  <Button
                    size="sm"
                    disabled={!canSendComment || addComment.isPending}
                    onClick={() => addComment.mutate(comment)}
                  >
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    {addComment.isPending ? 'Отправка…' : 'Отправить'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Sidebar / Right Column (Properties & Meta) */}
          <div className="space-y-6 lg:col-span-4">
            {/* Properties Card */}
            <Card className="p-5 shadow-xs border-border bg-card space-y-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-3">
                <Layers className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold tracking-tight text-foreground">Поля и атрибуты</h3>
              </div>

              <div className="space-y-4 text-xs">
                {/* Assignee */}
                <div className="space-y-1.5">
                  <Label htmlFor="work-item-detail-assignee" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="h-3.5 w-3.5 text-primary/70" /> Исполнитель
                  </Label>
                  <Dropdown
                    id="work-item-detail-assignee"
                    favoritesKey="work-item-detail-assignee"
                    value={assignedTo}
                    options={assigneeOptions}
                    onChange={(next) => {
                      setAssignedTo(next)
                      setDirty(true)
                    }}
                    onSearch={onAssigneeSearch}
                    placeholder={searching ? 'Поиск…' : 'Не назначен'}
                    emptyLabel="Не назначен"
                    searchPlaceholder="Поиск исполнителя…"
                    allowEmpty
                  />
                </div>

                {/* Priority */}
                <div className="space-y-1.5">
                  <Label htmlFor="work-item-detail-priority" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Flag className="h-3.5 w-3.5 text-primary/70" /> Приоритет
                  </Label>
                  <Dropdown
                    id="work-item-detail-priority"
                    value={priority}
                    options={[
                      { value: '1', label: '1 — Высочайший (P1)' },
                      { value: '2', label: '2 — Высокий (P2)' },
                      { value: '3', label: '3 — Средний (P3)' },
                      { value: '4', label: '4 — Низкий (P4)' },
                    ]}
                    onChange={(next) => {
                      setPriority(next)
                      setDirty(true)
                    }}
                    placeholder="Не указано"
                    emptyLabel="Не указано"
                    searchable={false}
                    allowEmpty
                  />
                </div>

                {/* Area */}
                <div className="space-y-1.5">
                  <Label htmlFor="work-item-detail-area" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Folder className="h-3.5 w-3.5 text-primary/70" /> Область (Area)
                  </Label>
                  <Dropdown
                    id="work-item-detail-area"
                    favoritesKey="work-item-detail-area"
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
                    onChange={(next) => {
                      setAreaPath(next || rootPath || '')
                      setDirty(true)
                    }}
                    placeholder="Не указано"
                    emptyLabel="Не указано"
                    searchPlaceholder="Поиск Area…"
                    allowEmpty
                  />
                </div>

                {/* Iteration */}
                <div className="space-y-1.5">
                  <Label htmlFor="work-item-detail-iteration" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 text-primary/70" /> Итерация (Sprint)
                  </Label>
                  <Dropdown
                    id="work-item-detail-iteration"
                    favoritesKey="work-item-detail-iteration"
                    value={iterationPath}
                    options={iterationOptions}
                    onChange={(next) => {
                      setIterationPath(next)
                      setDirty(true)
                    }}
                    placeholder="Не выбрано"
                    emptyLabel="Не выбрано"
                    searchPlaceholder="Поиск итерации…"
                    suggestionsLabel="Suggestions"
                    allowEmpty
                  />
                </div>

                {/* Tags */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Tag className="h-3.5 w-3.5 text-primary/70" /> Теги
                  </Label>
                  <TagsField
                    id="work-item-detail-tags"
                    value={tags}
                    options={knownTags}
                    onChange={onTagsChange}
                  />
                </div>
              </div>
            </Card>

            {/* Meta Info Card */}
            <Card className="p-5 shadow-xs border-border bg-card space-y-3">
              <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                Системная информация
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Колонка доски</span>
                  <Badge variant="outline" className="font-medium text-[11px]">
                    {data.boardColumn || data.state}
                  </Badge>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Создано</span>
                  <span className="font-medium text-foreground">
                    {data.createdDate ? formatRelative(data.createdDate) : '—'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Автор</span>
                  <span className="font-medium text-foreground">
                    {data.createdBy || '—'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Обновлено</span>
                  <span className="font-medium text-foreground">
                    {data.changedDate ? formatRelative(data.changedDate) : '—'}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
