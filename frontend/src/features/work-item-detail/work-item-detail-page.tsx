import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronDown, Paperclip, Save, Send, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PendingImageStrip, RemovableImageStrip } from '@/components/pending-image-strip'
import { AuthenticatedHtml, AuthenticatedImage } from '@/components/authenticated-media'
import { Button } from '@/components/ui/button'
import { Badge, Input, Textarea } from '@/components/ui/primitives'
import { queryKeys, useIterationPaths, useSettings, useUpdateWorkItem, useWorkItem, useWorkItemTypes } from '@/hooks/use-azure'
import { requireAzureApi } from '@/lib/azure-api'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  extractImageFromClipboardEvent,
  renderCommentHtml,
  toPendingImage,
  type PendingImage,
} from '@/lib/clipboard-image'
import {
  appendImageToDescription,
  descriptionImageUrls,
  htmlToPlainText,
  mediaUrlsMatch,
  mergePlainTextIntoDescription,
  removeImageFromDescription,
} from '@/lib/html-text'
import { cn, formatRelative, workItemColor } from '@/lib/utils'
import { useNotificationsStore } from '@/stores/notifications-store'

export function WorkItemDetailPage() {
  const { id = '' } = useParams()
  const workItemId = Number(id)
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useWorkItem(workItemId)
  const { data: types = [] } = useWorkItemTypes()
  const { data: settings } = useSettings()
  const { data: iterationPaths } = useIterationPaths()
  const update = useUpdateWorkItem()
  const qc = useQueryClient()
  const markReadByWorkItemId = useNotificationsStore((s) => s.markReadByWorkItemId)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [iterationPath, setIterationPath] = useState('')
  const [comment, setComment] = useState('')
  const [commentImages, setCommentImages] = useState<PendingImage[]>([])
  const [descriptionImages, setDescriptionImages] = useState<PendingImage[]>([])
  const [pendingRemovedUrls, setPendingRemovedUrls] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const [savingBody, setSavingBody] = useState(false)

  const selectedIteration = settings?.selectedIterationPath?.trim() || ''

  useEffect(() => {
    if (!Number.isFinite(workItemId) || workItemId <= 0) return
    markReadByWorkItemId(workItemId)
  }, [workItemId, markReadByWorkItemId])

  useEffect(() => {
    if (!data || dirty) return
    setTitle(data.title)
    setDescription(htmlToPlainText(data.description ?? ''))
    setIterationPath(data.iterationPath || '')
    setDescriptionImages([])
    setPendingRemovedUrls([])
  }, [data, dirty])

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
    const typeInfo = types.find((entry) => entry.name === data.type)
    const fromType = typeInfo?.states.map((entry) => entry.name) ?? []
    if (fromType.length) {
      return fromType.includes(data.state) ? fromType : [data.state, ...fromType]
    }
    return data.state ? [data.state] : []
  }, [data, types])

  const addComment = useMutation({
    mutationFn: (input: { text: string; attachments: PendingImage[] }) =>
      requireAzureApi().addComment({
        id: workItemId,
        text: input.text,
        attachments: input.attachments.map(({ fileName, mimeType, dataBase64 }) => ({
          fileName,
          mimeType,
          dataBase64,
        })),
      }),
    onSuccess: async () => {
      setComment('')
      setCommentImages([])
      await qc.invalidateQueries({ queryKey: queryKeys.workItem(workItemId) })
    },
  })

  const upload = useMutation({
    mutationFn: (file: { fileName: string; mimeType: string; dataBase64: string }) =>
      requireAzureApi().uploadAttachment(workItemId, file),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.workItem(workItemId) })
    },
  })

  const removeAttachment = useMutation({
    mutationFn: (attachmentUrl: string) => requireAzureApi().removeAttachment(workItemId, attachmentUrl),
  })

  useEffect(() => {
    const onPaste = async (event: ClipboardEvent) => {
      if (!data) return
      const target = event.target as HTMLElement | null
      const inCommentComposer = Boolean(target?.closest('[data-comment-composer]'))
      const inDescriptionComposer = Boolean(target?.closest('[data-description-composer]'))
      const image = await extractImageFromClipboardEvent(event)
      if (!image) return

      event.preventDefault()

      if (inCommentComposer) {
        setCommentImages((current) => [...current, toPendingImage(image)])
        setStatus('Скриншот добавлен в комментарий')
        return
      }

      if (inDescriptionComposer) {
        setDescriptionImages((current) => [...current, toPendingImage(image)])
        setDirty(true)
        setStatus('Скриншот добавлен — нажмите «Сохранить»')
      }
    }

    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [data])

  const htmlDescription = useMemo(() => {
    const original = data?.description || ''
    return pendingRemovedUrls.reduce(
      (html, url) => removeImageFromDescription(html, url),
      original,
    )
  }, [data?.description, pendingRemovedUrls])
  const embeddedUrls = useMemo(() => descriptionImageUrls(htmlDescription), [htmlDescription])
  const embeddedImages = useMemo(
    () =>
      [...embeddedUrls].map((src) => ({
        id: src,
        src,
        alt:
          data?.attachments.find((file) => mediaUrlsMatch(file.url, src))?.name ||
          'Изображение в описании',
      })),
    [embeddedUrls, data?.attachments],
  )
  const visibleAttachments = useMemo(
    () =>
      (data?.attachments ?? []).filter(
        (file) => !pendingRemovedUrls.some((url) => mediaUrlsMatch(url, file.url)),
      ),
    [data?.attachments, pendingRemovedUrls],
  )
  const canSendComment = Boolean(comment.trim() || commentImages.length)
  const canSaveBody =
    dirty &&
    (title.trim() !== (data?.title ?? '') ||
      description !== htmlToPlainText(data?.description ?? '') ||
      iterationPath !== (data?.iterationPath || '') ||
      descriptionImages.length > 0 ||
      pendingRemovedUrls.length > 0)

  const markAttachmentRemoved = (url: string) => {
    setPendingRemovedUrls((current) =>
      current.some((entry) => mediaUrlsMatch(entry, url)) ? current : [...current, url],
    )
    setDirty(true)
    setStatus('Вложение будет удалено при сохранении')
  }

  const saveBody = async () => {
    if (!data || !canSaveBody) return
    setSavingBody(true)
    try {
      let rev = data.rev
      let html = data.description ?? ''

      for (const url of pendingRemovedUrls) {
        const detail = await removeAttachment.mutateAsync(url)
        rev = detail.rev
        html = detail.description || html
      }

      for (const image of descriptionImages) {
        const detail = await upload.mutateAsync({
          fileName: image.fileName,
          mimeType: image.mimeType,
          dataBase64: image.dataBase64,
        })
        rev = detail.rev
        html = detail.description || html
        const latest = detail.attachments[detail.attachments.length - 1]
        if (latest?.url) {
          html = appendImageToDescription(html, latest.url, image.fileName)
        }
      }

      html = mergePlainTextIntoDescription(html, description)

      const fields: Record<string, string | number | boolean | null | undefined> = {
        'System.Title': title.trim(),
        'System.Description': html,
      }
      const nextIteration = iterationPath.trim()
      const prevIteration = (data.iterationPath || '').trim()
      if (nextIteration !== prevIteration) {
        fields['System.IterationPath'] = nextIteration || null
      }

      await update.mutateAsync({
        id: data.id,
        rev,
        fields,
      })
      setDescriptionImages([])
      setPendingRemovedUrls([])
      setDirty(false)
      setStatus('Сохранено')
      await qc.invalidateQueries({ queryKey: queryKeys.workItem(workItemId) })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось сохранить')
    } finally {
      setSavingBody(false)
    }
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
        <span className={cn('h-2.5 w-2.5 rounded-full', workItemColor(data.type))} />
        <Badge>{data.type}</Badge>
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
              {` · Исполнитель ${data.assignedTo || 'Не назначен'}`}
            </div>
            <div data-description-composer className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Описание
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Ctrl+V — вставить скриншот</span>
              </div>

              {htmlDescription ? (
                <AuthenticatedHtml
                  className="prose prose-sm max-w-none rounded-lg border border-slate-100 bg-slate-50 p-3 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 [&_img]:mt-2 [&_img]:max-h-64 [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200 dark:[&_img]:border-slate-700"
                  html={htmlDescription}
                />
              ) : null}

              {embeddedImages.length > 0 && (
                <RemovableImageStrip
                  images={embeddedImages}
                  disabled={savingBody}
                  onRemove={markAttachmentRemoved}
                />
              )}

              <Textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value)
                  setDirty(true)
                }}
                placeholder="Текст описания…"
                className="min-h-[96px]"
              />
              <PendingImageStrip
                images={descriptionImages}
                onRemove={(imageId) => {
                  setDescriptionImages((current) => current.filter((image) => image.id !== imageId))
                  setDirty(true)
                }}
              />
              <div className="flex justify-end">
                <Button disabled={!canSaveBody || savingBody} onClick={() => void saveBody()}>
                  <Save className="h-4 w-4" />
                  {savingBody ? 'Сохранение…' : 'Сохранить'}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Обсуждение</h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Ctrl+V — вставить скриншот</span>
            </div>
            <div className="mb-4 max-h-80 space-y-3 overflow-y-auto">
              {data.comments.length === 0 && (
                <div className="text-sm text-slate-500 dark:text-slate-400">Комментариев пока нет.</div>
              )}
              {data.comments.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950"
                >
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{entry.createdBy}</span>
                    <span>{formatRelative(entry.createdDate)}</span>
                  </div>
                  <AuthenticatedHtml
                    className="text-sm text-slate-800 dark:text-slate-200"
                    html={renderCommentHtml(entry.text)}
                  />
                </div>
              ))}
            </div>
            <div data-comment-composer className="space-y-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Написать комментарий… Ctrl+V — скриншот"
                className="min-h-[72px]"
              />
              <PendingImageStrip
                images={commentImages}
                onRemove={(imageId) =>
                  setCommentImages((current) => current.filter((image) => image.id !== imageId))
                }
              />
              <div className="flex justify-end">
                <Button
                  disabled={!canSendComment || addComment.isPending}
                  onClick={() =>
                    addComment.mutate({
                      text: comment.trim(),
                      attachments: commentImages,
                    })
                  }
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
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Область</dt>
                <dd className="truncate text-right">{data.areaPath || '—'}</dd>
              </div>
              <div className="space-y-1">
                <div className="text-slate-500 dark:text-slate-400">Итерация</div>
                <SearchableSelect
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
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Колонка доски</dt>
                <dd>{data.boardColumn || data.state}</dd>
              </div>
              <div className="flex flex-wrap gap-1 pt-2">
                {data.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left"
              onClick={() => setAttachmentsOpen((current) => !current)}
              aria-expanded={attachmentsOpen}
            >
              <h3 className="text-sm font-semibold">
                Вложения
                <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                  ({visibleAttachments.length})
                </span>
              </h3>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-slate-400 transition',
                  attachmentsOpen && 'rotate-180',
                )}
              />
            </button>

            {attachmentsOpen && (
              <div className="mt-3 space-y-3">
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const image = await requireAzureApi().readClipboardImage()
                      if (!image) {
                        setStatus('В буфере нет изображения')
                        return
                      }
                      setStatus('Загрузка вложения…')
                      await upload.mutateAsync(image)
                      setStatus('Вложение загружено')
                    }}
                  >
                    <Paperclip className="h-4 w-4" /> Вставить изображение
                  </Button>
                </div>
                <div className="space-y-2">
                  {visibleAttachments.length === 0 && (
                    <div className="text-sm text-slate-500">Нет вложений</div>
                  )}
                  {visibleAttachments.map((file) => {
                    const embedded = [...embeddedUrls].some((url) => mediaUrlsMatch(url, file.url))
                    return (
                      <div key={file.id} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate rounded-md border border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                            onClick={() => requireAzureApi().openExternal(file.url)}
                          >
                            {file.name}
                            {embedded && (
                              <span className="ml-2 text-[11px] text-slate-400">в описании</span>
                            )}
                          </button>
                          <button
                            type="button"
                            className="shrink-0 rounded-full bg-slate-900/70 p-1 text-white hover:bg-slate-900 disabled:opacity-50"
                            disabled={savingBody}
                            onClick={() => markAttachmentRemoved(file.url)}
                            aria-label={`Удалить ${file.name}`}
                            title="Удалить"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {looksLikeImage(file.name, file.url) && (
                          <div className="group relative">
                            <AuthenticatedImage
                              src={file.url}
                              alt={file.name}
                              className="max-h-48 w-full rounded-lg border object-contain"
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-2 rounded-full bg-slate-900/70 p-0.5 text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-50"
                              disabled={savingBody}
                              onClick={() => markAttachmentRemoved(file.url)}
                              aria-label={`Удалить ${file.name}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <Button variant="secondary" onClick={() => void refetch()}>
            Обновить
          </Button>
        </div>
      </div>
    </div>
  )
}

function looksLikeImage(name: string, url: string) {
  if (url.startsWith('data:image')) return true
  return (
    /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(name) ||
    /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(url) ||
    /\/_apis\/wit\/attachments\//i.test(url)
  )
}
