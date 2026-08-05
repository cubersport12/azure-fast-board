import { Calendar, ExternalLink, FileText, Folder, MessageSquare, User } from 'lucide-react'
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

function getInitials(name?: string) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function typeAccentBorder(type: string) {
  const key = type.toLowerCase()
  if (key.includes('bug')) return 'border-l-[3px] border-l-rose-500'
  if (key.includes('task')) return 'border-l-[3px] border-l-amber-500'
  if (key.includes('user story') || key.includes('story')) return 'border-l-[3px] border-l-sky-500'
  if (key.includes('feature')) return 'border-l-[3px] border-l-violet-500'
  return 'border-l-[3px] border-l-primary'
}

function priorityBadgeStyle(priority: number | string) {
  const p = String(priority)
  if (p === '1') return 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
  if (p === '2') return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
  if (p === '3') return 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
  return 'border-border bg-muted text-muted-foreground'
}

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
        'group relative flex w-full min-w-0 cursor-grab flex-col rounded-xl border border-border/80 bg-card p-3 text-left shadow-xs transition-all duration-200 active:cursor-grabbing hover:border-primary/40 hover:shadow-md',
        typeAccentBorder(item.type),
        dragging ? 'opacity-40 ring-2 ring-primary shadow-lg' : '',
        compact && 'p-2.5',
      )}
      style={{ touchAction: 'none' }}
      {...dragAttributes}
      {...dragListeners}
    >
      <div
        role="button"
        tabIndex={0}
        className="flex min-w-0 flex-1 flex-col text-left outline-none"
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
        {/* Header Row: Type, ID, Priority, Status & Quick Actions */}
        <div className="flex items-center justify-between gap-1.5 text-xs">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className={cn('h-2 w-2 rounded-full shrink-0', workItemColor(item.type))} />
            <span className="font-mono text-[11px] font-bold text-muted-foreground/90">
              #{item.id}
            </span>
            <span className="text-[11px] font-medium text-foreground/80 truncate">
              {item.type}
            </span>

            {fields.has('priority') && item.priority != null && (
              <Badge
                variant="outline"
                className={cn('text-[10px] px-1.5 py-0 font-semibold h-4', priorityBadgeStyle(item.priority))}
              >
                P{item.priority}
              </Badge>
            )}

            {fields.has('status') && item.state && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium h-4">
                {item.state}
              </Badge>
            )}
          </div>

          {/* Quick Action Buttons */}
          <div
            className="flex items-center gap-0.5 opacity-80 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              title="Открыть в Azure DevOps"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
              onClick={(e) => void openAzure(e)}
            >
              <ExternalLink className="h-3 w-3" />
            </button>
            <SendToMattermostButton workItemId={item.id} compact />
          </div>
        </div>

        {/* Work Item Title */}
        <div className="my-2 text-xs md:text-sm font-medium text-foreground leading-snug line-clamp-3 wrap-anywhere">
          {item.title}
        </div>

        {/* Description Preview (if enabled) */}
        {fields.has('description') && descriptionPreview && (
          <div className="mb-2 line-clamp-2 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground border border-border/40 flex items-start gap-1.5">
            <FileText className="h-3 w-3 shrink-0 mt-0.5 opacity-60" />
            <span className="min-w-0 flex-1">{descriptionPreview}</span>
          </div>
        )}

        {/* Comment Preview (if enabled) */}
        {fields.has('comments') && commentPreview && (
          <div className="mb-2 line-clamp-2 rounded-md bg-amber-500/5 dark:bg-amber-500/10 p-2 text-[11px] text-muted-foreground border border-amber-500/20 italic flex items-start gap-1.5">
            <MessageSquare className="h-3 w-3 shrink-0 mt-0.5 text-amber-500 opacity-80" />
            <span className="min-w-0 flex-1">{commentPreview}</span>
          </div>
        )}

        {/* Tags List */}
        {item.tags && item.tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                {tag}
              </Badge>
            ))}
            {item.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground self-center">
                +{item.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Footer: Metadata & Assignee */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {fields.has('area') && item.areaPath && (
              <span className="inline-flex items-center gap-1 truncate max-w-30" title={`Area: ${item.areaPath}`}>
                <Folder className="h-3 w-3 text-primary/70 shrink-0" />
                <span className="truncate">{item.areaPath.split('\\').pop()}</span>
              </span>
            )}

            {fields.has('createdBy') && item.createdBy && (
              <span className="inline-flex items-center gap-1 truncate max-w-25" title={`Автор: ${item.createdBy}`}>
                <User className="h-3 w-3 text-primary/70 shrink-0" />
                <span className="truncate">{item.createdBy}</span>
              </span>
            )}

            {fields.has('createdDate') && item.createdDate && (
              <span className="inline-flex items-center gap-1 shrink-0" title={`Создано: ${formatRelative(item.createdDate)}`}>
                <Calendar className="h-3 w-3 opacity-60 shrink-0" />
                <span>{formatRelative(item.createdDate)}</span>
              </span>
            )}
          </div>

          {/* Assignee Avatar */}
          {fields.has('assignee') && (
            <div className="shrink-0">
              {item.assignedTo ? (
                <div className="flex items-center gap-1.5" title={`Исполнитель: ${item.assignedTo}`}>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary border border-primary/20">
                    {getInitials(item.assignedTo)}
                  </div>
                  <span className="max-w-20 truncate text-[11px] font-medium text-foreground/80">
                    {item.assignedTo}
                  </span>
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground/60 italic">
                  Не назначен
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
