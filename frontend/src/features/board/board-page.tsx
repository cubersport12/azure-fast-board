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
import { boardColumnsFromStates, resolveBoardColumnName } from '../../../shared/board-columns'
import { BoardCardPresetBar } from '@/components/board-card-preset-bar'
import { WorkItemFilterBar } from '@/components/work-item-filter-bar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'
import {
  useMoveWorkItem,
  useSettings,
  useWorkItems,
  useWorkItemTypes,
} from '@/hooks/use-azure'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { getAzureApi } from '@/lib/azure-api'
import { fieldsForPreset, stripHtmlPreview } from '@/lib/board-card-presets'
import { applyWorkItemFilters, EMPTY_FILTERS } from '@/lib/work-item-filters'
import { useUiStore } from '@/stores/ui-store'
import { WorkItemCard } from '@/features/work-items/work-item-card'

function columnKey(item: WorkItem, knownStates: string[]) {
  return resolveBoardColumnName(item.state || item.boardColumn || 'New', knownStates)
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
      className={`flex min-w-0 flex-1 flex-col rounded-xl border transition-all duration-200 bg-muted/30 ${
        isOver ? 'border-primary/60 bg-primary/5 ring-2 ring-primary/20' : 'border-border/80'
      }`}
    >
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5 bg-card/60 rounded-t-xl">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-xs font-bold uppercase tracking-wide text-foreground/90">
            {column.name}
          </span>
          <Badge variant="secondary" className="text-[11px] font-semibold px-1.5 py-0 h-5">
            {items.length}
          </Badge>
        </div>
        <Button size="icon" variant="ghost" onClick={onAdd} title="Быстрое создание" className="h-7 w-7 text-muted-foreground hover:text-foreground">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overflow-x-hidden p-2.5">
        {items.map((item) => (
          <DraggableCard
            key={item.id}
            item={item}
            column={column.name}
            visibleFields={visibleFields}
            commentPreview={commentPreviews.get(item.id)}
          />
        ))}
        {items.length === 0 && (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground/60">
            Нет элементов
          </div>
        )}
      </div>
    </div>
  )
})

export function BoardPage() {
  const { data: items = [], isPending } = useWorkItems()
  const { data: types = [] } = useWorkItemTypes()
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

  const filtered = useMemo(
    () => applyWorkItemFilters(items, search, EMPTY_FILTERS),
    [items, search],
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

  const knownStates = useMemo(
    () => [
      ...new Set(
        types
          .filter((entry) => /^(bug|task)$/i.test(entry.name))
          .flatMap((entry) => entry.states.map((state) => state.name)),
      ),
    ],
    [types],
  )

  const displayColumns = useMemo(() => boardColumnsFromStates(knownStates), [knownStates])

  const grouped = useMemo(() => {
    const map = new Map<string, WorkItem[]>()
    for (const column of displayColumns) map.set(column.name, [])
    for (const item of filtered) {
      const key = columnKey(item, knownStates)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return map
  }, [filtered, displayColumns, knownStates])

  const extraColumns = useMemo(
    () =>
      [...grouped.entries()]
        .filter(
          ([name]) => !displayColumns.some((column) => column.name === name),
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

    const overData = over.data.current
    const rawTarget =
      overData?.type === 'column' && overData.column
        ? String(overData.column)
        : String(over.id).startsWith('column:')
          ? String(over.id).replace(/^column:/, '')
          : String(overData?.column || '')
    const targetColumn = resolveBoardColumnName(rawTarget, knownStates)
    if (!targetColumn || columnKey(item, knownStates) === targetColumn) return

    move.mutate({
      id: item.id,
      column: targetColumn,
      rev: item.rev,
      state: targetColumn,
    })
  }

  const onDragCancel = () => setActive(null)

  if (isPending) {
    return <div className="p-6 text-sm text-muted-foreground">Загрузка доски…</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <WorkItemFilterBar
        items={items}
        filters={filters}
        onChange={setFilters}
        trailing={<BoardCardPresetBar />}
      />
      <div className="shrink-0 text-sm text-muted-foreground">{filtered.length} карточек</div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-hidden">
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
