import { ExternalLink } from 'lucide-react'
import { memo, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BoardCardFieldId, WorkItem } from '../../../shared/types'
import { Badge } from '@/components/ui/primitives'
import { SendToMattermostButton } from '@/features/mattermost/send-to-mattermost-button'
import { getAzureApi } from '@/lib/azure-api'
import { stripHtmlPreview } from '@/lib/board-card-presets'
import { cn, formatRelative, workItemColor } from '@/lib/utils'
import { buildWorkItemWebUrl } from '../../../shared/utils'
import { useConnection } from '@/hooks/use-azure'

export const WorkItemCard = memo(function WorkItemCard({
  item,
  compact,
  dragging,
  dragListeners,
  dragAttributes,
  onOpen,
  visibleFields,
  commentPreview,
}: {
  item: WorkItem
  compact?: boolean
  dragging?: boolean
  dragListeners?: Record<string, unknown>
  dragAttributes?: Record<string, unknown>
  onOpen?: () => void
  visibleFields?: Set<BoardCardFieldId>
  commentPreview?: string
}) {
  const navigate = useNavigate()
  const { data: connection } = useConnection()
  const fields = visibleFields ?? new Set<BoardCardFieldId>()

  const openAzure = async (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (!connection) return
    const url = item.url?.includes('_workitems')
      ? item.url
      : buildWorkItemWebUrl(connection, item.id)
    await getAzureApi()?.openExternal(url)
  }

  const descriptionPreview = stripHtmlPreview(item.reproSteps || item.description)

  return (
    <div
      className={cn(
        'w-full min-w-0 cursor-grab rounded-lg border border-border bg-card p-3 text-left shadow-sm active:cursor-grabbing',
        dragging ? 'opacity-40 ring-2 ring-ring' : 'hover:border-ring/40 hover:shadow-md',
        compact && 'p-2.5',
      )}
      style={{ touchAction: 'none' }}
      {...dragAttributes}
      {...dragListeners}
    >
      <div
        role="button"
        tabIndex={0}
        className="block w-full min-w-0 text-left outline-none"
        onClick={(event) => {
          if (dragging) return
          event.stopPropagation()
          if (onOpen) onOpen()
          else navigate(`/work-items/${item.id}`)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          if (onOpen) onOpen()
          else navigate(`/work-items/${item.id}`)
        }}
      >
        <div className="mb-2 flex min-w-0 items-start gap-2">
          <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', workItemColor(item.type))} />
          <div className="min-w-0 flex-1">
            <div className="whitespace-normal break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">
              {item.title}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span>#{item.id}</span>
              <span>·</span>
              <span>{item.type}</span>
              {fields.has('status') && (
                <>
                  <span>·</span>
                  <span>{item.state}</span>
                </>
              )}
              {fields.has('priority') && item.priority != null && (
                <>
                  <span>·</span>
                  <span>P{item.priority}</span>
                </>
              )}
              {fields.has('createdBy') && item.createdBy && (
                <>
                  <span>·</span>
                  <span title={`Автор: ${item.createdBy}`}>авт. {item.createdBy}</span>
                </>
              )}
              {fields.has('assignee') && item.assignedTo && (
                <>
                  <span>·</span>
                  <span title={`Исполнитель: ${item.assignedTo}`}>{item.assignedTo}</span>
                </>
              )}
            </div>
            {(fields.has('area') && item.areaPath) ||
            (fields.has('createdDate') && item.createdDate) ? (
              <div className="mt-1 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {fields.has('area') && item.areaPath ? (
                  <div className="break-words" title={item.areaPath}>
                    Место: {item.areaPath}
                  </div>
                ) : null}
                {fields.has('createdDate') && item.createdDate ? (
                  <div>Создано: {formatRelative(item.createdDate)}</div>
                ) : null}
              </div>
            ) : null}
            {fields.has('description') && descriptionPreview ? (
              <div className="mt-1.5 line-clamp-3 text-[11px] text-slate-600 dark:text-slate-300">
                {descriptionPreview}
              </div>
            ) : null}
            {fields.has('comments') && commentPreview ? (
              <div className="mt-1.5 line-clamp-2 text-[11px] italic text-slate-500 dark:text-slate-400">
                {commentPreview}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary">{tag}</Badge>
            ))}
          </div>
          <span className="shrink-0 text-[11px] text-slate-400">{formatRelative(item.changedDate)}</span>
        </div>
      </div>
      <div
        className="mt-2 flex justify-end gap-1"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          title="Открыть в Azure DevOps"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-sky-700 dark:hover:bg-slate-800 dark:hover:text-sky-300"
          onClick={(e) => void openAzure(e)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
        <SendToMattermostButton workItemId={item.id} compact />
      </div>
    </div>
  )
})
