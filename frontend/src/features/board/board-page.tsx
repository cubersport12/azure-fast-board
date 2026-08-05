import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useQueries } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import type { BoardCardFieldId, BoardColumn, WorkItem } from '../../../shared/types'
import { BoardCardPresetBar } from '@/components/board-card-preset-bar'
import { WorkItemFilterBar } from '@/components/work-item-filter-bar'
import { Button } from '@/components/ui/button'
import {
  useBoardColumns,
  useConnection,
  useCurrentUser,
  useMoveWorkItem,
  useSettings,
  useWorkItems,
} from '@/hooks/use-azure'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { getAzureApi } from '@/lib/azure-api'
import { fieldsForPreset, stripHtmlPreview } from '@/lib/board-card-presets'
import { applyWorkItemFilters } from '@/lib/work-item-filters'
import { useUiStore } from '@/stores/ui-store'
import { WorkItemCard } from '@/features/work-items/work-item-card'

/** Map Task "To Do" into the New column (bugs + tasks together). */
function normalizeBoardColumnName(name: string) {
  const key = name.trim()
  if (/^to\s*do$/i.test(key)) return 'New'
  return key
}

function columnKey(item: WorkItem) {
  return normalizeBoardColumnName(item.boardColumn || item.state || 'New')
}

function isHiddenBoardColumn(name: string) {
  return /^to\s*do$/i.test(name.trim())
}

const DraggableCard = memo(function DraggableCard({
  item,
  column,
  visibleFields,
  commentPreview,
}: {
  item: WorkItem
  column: string
  visibleFields: Set<BoardCardFieldId>
  commentPreview?: string
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: String(item.id),
    data: { item, type: 'card', column },
  })
  const { setNodeRef: setDropRef } = useDroppable({
    id: `card-drop:${item.id}`,
    data: { type: 'column', column },
  })

  return (
    <div
      ref={(node) => {
        setDragRef(node)
        setDropRef(node)
      }}
      className={isDragging ? 'min-w-0 opacity-30' : 'min-w-0'}
    >
      <WorkItemCard
        item={item}
        dragging={isDragging}
        dragAttributes={attributes as unknown as Record<string, unknown>}
        dragListeners={listeners as unknown as Record<string, unknown>}
        visibleFields={visibleFields}
        commentPreview={commentPreview}
      />
    </div>
  )
})

const Column = memo(function Column({
  column,
  items,
  onAdd,
  visibleFields,
  commentPreviews,
}: {
  column: BoardColumn
  items: WorkItem[]
  onAdd: () => void
  visibleFields: Set<BoardCardFieldId>
  commentPreviews: Map<number, string>
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column.name}`,
    data: { type: 'column', column: column.name },
  })

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 flex-1 flex-col rounded-xl border bg-slate-50/80 dark:bg-slate-900/80 ${
        isOver ? 'border-sky-400 bg-sky-50/40 dark:bg-sky-950/40' : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {column.name}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{items.length} эл.</div>
        </div>
        <Button size="icon" variant="ghost" onClick={onAdd} title="Быстрое создание">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex min-h-[120px] max-h-[calc(100vh-280px)] flex-col gap-2 overflow-y-auto overflow-x-hidden p-2">
        {items.map((item) => (
          <DraggableCard
            key={item.id}
            item={item}
            column={column.name}
            visibleFields={visibleFields}
            commentPreview={commentPreviews.get(item.id)}
          />
        ))}
      </div>
    </div>
  )
})

export function BoardPage() {
  const { data: items = [], isLoading } = useWorkItems()
  const { data: columns = [] } = useBoardColumns()
  const { data: connection } = useConnection()
  const { data: currentUser } = useCurrentUser()
  const { data: settings } = useSettings()
  const move = useMoveWorkItem()
  const search = useUiStore((s) => s.search)
  const { filters, setFilters } = usePersistedFilters()
  const setQuickCreateOpen = useUiStore((s) => s.setQuickCreateOpen)
  const [active, setActive] = useState<WorkItem | null>(null)

  const visibleFields = useMemo(
    () =>
      fieldsForPreset(
        settings?.boardCardFieldPresets ?? [],
        settings?.activeBoardCardFieldPresetId ?? '',
      ),
    [settings?.boardCardFieldPresets, settings?.activeBoardCardFieldPresetId],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  const me = useMemo(
    () => ({
      username: connection?.username,
      displayName: currentUser?.displayName,
      uniqueName: currentUser?.uniqueName,
    }),
    [connection?.username, currentUser?.displayName, currentUser?.uniqueName],
  )

  const filtered = useMemo(
    () =>
      applyWorkItemFilters(
        items,
        search,
        filters,
        me,
        settings?.selectedIterationPath,
      ),
    [items, search, filters, me, settings?.selectedIterationPath],
  )

  const needComments = visibleFields.has('comments')
  const commentQueries = useQueries({
    queries: needComments
      ? filtered.slice(0, 80).map((item) => ({
          queryKey: ['board-comment-preview', item.id] as const,
          queryFn: async () => {
            const comments = await getAzureApi()?.getComments(item.id)
            const last = comments?.[comments.length - 1]
            return {
              id: item.id,
              preview: stripHtmlPreview(last?.text),
            }
          },
          staleTime: 60_000,
        }))
      : [],
  })

  const commentPreviews = useMemo(() => {
    const map = new Map<number, string>()
    for (const q of commentQueries) {
      if (q.data?.preview) map.set(q.data.id, q.data.preview)
    }
    return map
  }, [commentQueries])

  const displayColumns = useMemo(
    () =>
      columns
        .filter((column) => !isHiddenBoardColumn(column.name))
        .map((column) =>
          normalizeBoardColumnName(column.name) === column.name
            ? column
            : { ...column, name: normalizeBoardColumnName(column.name) },
        )
        // If ADO listed both New and To Do, keep a single New after rename.
        .filter((column, index, list) => list.findIndex((c) => c.name === column.name) === index),
    [columns],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, WorkItem[]>()
    for (const column of displayColumns) map.set(column.name, [])
    for (const item of filtered) {
      const key = columnKey(item)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return map
  }, [filtered, displayColumns])

  const extraColumns = useMemo(
    () =>
      [...grouped.entries()]
        .filter(
          ([name]) =>
            !isHiddenBoardColumn(name) &&
            !displayColumns.some((column) => column.name === name),
        )
        .map(([name, columnItems]) => ({ name, columnItems })),
    [grouped, displayColumns],
  )

  const onDragStart = (event: DragStartEvent) => {
    const item = event.active.data.current?.item as WorkItem | undefined
    setActive(item ?? null)
  }

  const onDragEnd = (event: DragEndEvent) => {
    const item = event.active.data.current?.item as WorkItem | undefined
    const over = event.over
    setActive(null)
    if (!item || !over) return

    let targetColumn = ''
    const overData = over.data.current
    if (overData?.type === 'column' && overData.column) {
      targetColumn = String(overData.column)
    } else if (String(over.id).startsWith('column:')) {
      targetColumn = String(over.id).replace(/^column:/, '')
    } else if (String(over.id).startsWith('card-drop:')) {
      targetColumn = String(overData?.column || '')
    }

    targetColumn = normalizeBoardColumnName(targetColumn)
    if (!targetColumn || columnKey(item) === targetColumn) return

    const boardColumn =
      displayColumns.find((entry) => entry.name === targetColumn) ||
      columns.find((entry) => normalizeBoardColumnName(entry.name) === targetColumn)
    const mappedState =
      boardColumn?.stateMappings?.[item.type] ||
      boardColumn?.stateMappings?.['*'] ||
      targetColumn
    move.mutate({
      id: item.id,
      column: targetColumn,
      rev: item.rev,
      state: mappedState,
    })
  }

  const onDragCancel = () => setActive(null)

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500 dark:text-slate-400">Загрузка доски…</div>
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <WorkItemFilterBar
        items={items}
        filters={filters}
        onChange={setFilters}
        trailing={<BoardCardPresetBar />}
      />
      <div className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} карточек</div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="flex w-full gap-3 pb-2">
          {displayColumns.map((column) => (
            <Column
              key={column.id}
              column={column}
              items={grouped.get(column.name) ?? []}
              onAdd={() => setQuickCreateOpen(true)}
              visibleFields={visibleFields}
              commentPreviews={commentPreviews}
            />
          ))}
          {extraColumns.map(({ name, columnItems }) => (
            <Column
              key={name}
              column={{ id: name, name, order: 999 }}
              items={columnItems}
              onAdd={() => setQuickCreateOpen(true)}
              visibleFields={visibleFields}
              commentPreviews={commentPreviews}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {active ? (
            <WorkItemCard
              item={active}
              dragging
              visibleFields={visibleFields}
              commentPreview={commentPreviews.get(active.id)}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
