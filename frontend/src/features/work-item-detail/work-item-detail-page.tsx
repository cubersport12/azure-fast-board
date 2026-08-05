import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Save, Send } from 'lucide-react'
import { SendToMattermostButton } from '@/features/mattermost/send-to-mattermost-button'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AuthenticatedHtml } from '@/components/authenticated-media'
import { RichTextEditor, htmlPlainText, isRichTextEmpty } from '@/components/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/primitives'
import { Dropdown } from '@/components/ui/dropdown'
import { TagsField } from '@/components/tags-field'
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

export function WorkItemDetailPage() {
  const { id = '' } = useParams()
  const workItemId = Number(id)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightCommentId = Number(searchParams.get('commentId') || '')
  const { data, isLoading, refetch } = useWorkItem(workItemId)
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

  const selectedIteration = settings?.selectedIterationPath?.trim() || ''
  const areas = areaPaths?.areas ?? []
  const rootPath = areaPaths?.rootPath || connection?.project || ''
  const bodyField = bodyFieldForType(workItemType || data?.type || '')
  const isReproBody = bodyField === ADO_FIELD_REPRO_STEPS
  const serverBodyHtml = isReproBody ? (data?.reproSteps ?? '') : (data?.description ?? '')
  // Never feed the editor an empty string while server still has ReproSteps HTML.
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
          (prev) => {
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

  const saveBody = async () => {
    if (!data || !canSaveBody) return
    setSavingBody(true)
    try {
      const fields: Record<string, string | number | boolean | null | undefined> = {}

      if (title.trim() !== (data.title ?? '')) {
        fields['System.Title'] = title.trim()
      }

      // Only touch Description/ReproSteps when the user actually edited the body.
      // Otherwise Area/Assignee/… saves re-PATCHed HTML from the editor (often
      // without restored img srcs) and the cleanup below deleted every attachment.
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
          // TipTap/hydration dropped remote srcs — keep server HTML, still save other fields.
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

      // Re-read rev after possible attachment removals.
      const fresh = await requireAzureApi().getWorkItem(workItemId)
      await update.mutateAsync({
        id: data.id,
        rev: fresh.rev,
        fields,
      })
      setDirty(false)
      setStatus(
        bodySkippedImages
          ? 'Сохранено (описание не трогали — пропали src картинок в редакторе)'
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

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-slate-500 dark:text-slate-400">Загрузка рабочего элемента…</div>
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Назад
        </Button>
        <span className={cn('h-2.5 w-2.5 rounded-full', workItemColor(workItemType || data.type))} />
        <select
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          value={workItemType || data.type}
          disabled={update.isPending || types.length === 0}
          onChange={(event) => {
            setWorkItemType(event.target.value)
            setDirty(true)
          }}
          aria-label="Тип"
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
        <select
          className="h-8 rounded-md border border-sky-200 bg-sky-50 px-2 text-sm font-medium text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200"
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
        <span className="text-xs text-slate-500 dark:text-slate-400">#{data.id}</span>
        <SendToMattermostButton workItemId={data.id} />
        <Button variant="secondary" size="sm" onClick={() => void openAzure()} title="Открыть в Azure">
          <ExternalLink className="h-4 w-4" />
          Azure
        </Button>
        {status && <span className="text-xs text-emerald-600 dark:text-emerald-400">{status}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setDirty(true)
              }}
              className="border-0 px-0 text-xl font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Обновлено {formatRelative(data.changedDate)}
              {data.createdBy ? ` · Автор ${data.createdBy}` : ''}
            </div>
            <div className="mt-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {isReproBody ? 'Шаги воспроизведения' : 'Описание'}
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
                    ? 'Steps to Reproduce… Ctrl+V — скриншот'
                    : 'Текст описания… Ctrl+V — скриншот'
                }
                minHeight={180}
                data-composer="body"
              />
              <div className="flex justify-end">
                <Button disabled={!canSaveBody || savingBody} onClick={() => void saveBody()}>
                  <Save className="h-4 w-4" />
                  {savingBody ? 'Сохранение…' : 'Сохранить'}
                </Button>
              </div>
            </div>
          </div>

          <div
            id="wi-discussion"
            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Обсуждение</h3>
            </div>
            <div className="mb-4 max-h-80 space-y-3 overflow-y-auto">
              {data.comments.length === 0 && (
                <div className="text-sm text-slate-500 dark:text-slate-400">Комментариев пока нет.</div>
              )}
              {data.comments.map((entry) => (
                <div
                  key={entry.id}
                  id={`wi-comment-${entry.id}`}
                  className={cn(
                    'rounded-lg border p-3 transition-colors duration-500',
                    activeHighlightCommentId === entry.id
                      ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-300 dark:border-amber-500 dark:bg-amber-950/50 dark:ring-amber-700'
                      : 'border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-950',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{entry.createdBy}</span>
                    <span>{formatRelative(entry.createdDate)}</span>
                  </div>
                  <AuthenticatedHtml
                    className="max-w-none text-sm text-slate-800 dark:text-slate-200 [&_img]:mt-2 [&_img]:max-h-64 [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200 dark:[&_img]:border-slate-700 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                    html={renderCommentHtml(entry.text)}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <RichTextEditor
                value={comment}
                onChange={setComment}
                onUploadImage={onCommentUpload}
                placeholder="Написать комментарий… Ctrl+V — скриншот"
                minHeight={96}
                data-composer="comment"
              />
              <div className="flex justify-end">
                <Button
                  disabled={!canSendComment || addComment.isPending}
                  onClick={() => addComment.mutate(comment)}
                >
                  <Send className="h-4 w-4" />
                  {addComment.isPending ? 'Отправка…' : 'Отправить'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-semibold">Поля</h3>
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <Label htmlFor="work-item-detail-area">Область</Label>
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
              <div className="space-y-1">
                <Label htmlFor="work-item-detail-iteration">Итерация</Label>
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
              <div className="space-y-1">
                <Label htmlFor="work-item-detail-assignee">Исполнитель</Label>
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
              <div className="space-y-1">
                <Label htmlFor="work-item-detail-priority">Приоритет</Label>
                <select
                  id="work-item-detail-priority"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={priority}
                  onChange={(event) => {
                    setPriority(event.target.value)
                    setDirty(true)
                  }}
                >
                  <option value="">Не указано</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Теги</Label>
                <TagsField
                  id="work-item-detail-tags"
                  value={tags}
                  options={knownTags}
                  onChange={onTagsChange}
                />
              </div>
              <div className="flex justify-between gap-3 pt-1 text-slate-500 dark:text-slate-400">
                <span>Колонка доски</span>
                <span className="text-slate-900 dark:text-slate-100">
                  {data.boardColumn || data.state}
                </span>
              </div>
            </div>
          </div>

          <Button variant="secondary" onClick={() => void refetch()}>
            Обновить
          </Button>
        </div>
      </div>
    </div>
  )
}
