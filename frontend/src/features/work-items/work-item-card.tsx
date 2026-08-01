import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { WorkItem } from '../../../shared/types'
import { Badge } from '@/components/ui/primitives'
import { SendToMattermostButton } from '@/features/mattermost/send-to-mattermost-button'
import { cn, formatRelative, workItemColor } from '@/lib/utils'

export const WorkItemCard = memo(function WorkItemCard({
  item,
  compact,
  dragging,
  dragListeners,
  dragAttributes,
  onOpen,
}: {
  item: WorkItem
  compact?: boolean
  dragging?: boolean
  dragListeners?: Record<string, unknown>
  dragAttributes?: Record<string, unknown>
  onOpen?: () => void
}) {
  const navigate = useNavigate()

  return (
    <div
      className={cn(
        'w-full cursor-grab rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm active:cursor-grabbing dark:border-slate-700 dark:bg-slate-900',
        dragging ? 'opacity-40 ring-2 ring-sky-400' : 'hover:border-sky-300 hover:shadow dark:hover:border-sky-700',
        compact && 'p-2.5',
      )}
      style={{ touchAction: 'none' }}
      {...dragAttributes}
      {...dragListeners}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={(event) => {
          // Avoid opening while finishing a drag
          if (dragging) return
          event.stopPropagation()
          if (onOpen) onOpen()
          else navigate(`/work-items/${item.id}`)
        }}
      >
        <div className="mb-2 flex items-start gap-2">
          <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', workItemColor(item.type))} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span>#{item.id}</span>
              <span>·</span>
              <span>{item.type}</span>
              {item.createdBy && (
                <>
                  <span>·</span>
                  <span className="truncate" title={`Автор: ${item.createdBy}`}>
                    авт. {item.createdBy}
                  </span>
                </>
              )}
              {item.assignedTo && (
                <>
                  <span>·</span>
                  <span className="truncate" title={`Исполнитель: ${item.assignedTo}`}>
                    {item.assignedTo}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
          <span className="shrink-0 text-[11px] text-slate-400">{formatRelative(item.changedDate)}</span>
        </div>
      </button>
      <div
        className="mt-2 flex justify-end"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <SendToMattermostButton workItemId={item.id} compact />
      </div>
    </div>
  )
})
