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
import { Plus } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import type { BoardColumn, WorkItem } from '../../../shared/types'
import { WorkItemFilterBar } from '@/components/work-item-filter-bar'
import { Button } from '@/components/ui/button'
import { useBoardColumns, useConnection, useMoveWorkItem, useSettings, useWorkItems } from '@/hooks/use-azure'
import { applyWorkItemFilters } from '@/lib/work-item-filters'
import { useUiStore } from '@/stores/ui-store'
import { WorkItemCard } from '@/features/work-items/work-item-card'

function columnKey(item: WorkItem) {
  return item.boardColumn || item.state || 'New'
}

const DraggableCard = memo(function DraggableCard({ item }: { item: WorkItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(item.id),
    data: { item, type: 'card' },
  })

  return (
    <div ref={setNodeRef} className={isDragging ? 'opacity-30' : undefined}>
      <WorkItemCard
        item={item}
        dragging={isDragging}
        dragAttributes={attributes as unknown as Record<string, unknown>}
        dragListeners={listeners as unknown as Record<string, unknown>}
      />
    </div>
  )
})

const Column = memo(function Column({
  column,
  items,
  onAdd,
}: {
  column: BoardColumn
  items: WorkItem[]
  onAdd: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column.name}`,
    data: { type: 'column', column: column.name },
  })

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-xl border bg-slate-50/80 dark:bg-slate-900/80 ${
        isOver ? 'border-sky-400 bg-sky-50/40 dark:bg-sky-950/40' : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{column.name}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{items.length} эл.</div>
        </div>
        <Button size="icon" variant="ghost" onClick={onAdd} title="Быстрое создание">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex max-h-[calc(100vh-280px)] flex-col gap-2 overflow-y-auto p-2 contain-paint">
        {items.map((item) => (
          <DraggableCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
})

export function BoardPage() {
  const { data: items = [], isLoading } = useWorkItems()
  const { data: columns = [] } = useBoardColumns()
  const { data: connection } = useConnection()
  const { data: settings } = useSettings()
  const move = useMoveWorkItem()
  const search = useUiStore((s) => s.search)
  const filters = useUiStore((s) => s.filters)
  const setFilters = useUiStore((s) => s.setFilters)
  const setQuickCreateOpen = useUiStore((s) => s.setQuickCreateOpen)
  const [active, setActive] = useState<WorkItem | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 },
    }),
  )

  const filtered = useMemo(
    () =>
      applyWorkItemFilters(
        items,
        search,
        filters,
        connection?.username,
        settings?.selectedIterationPath,
      ),
    [items, search, filters, connection?.username, settings?.selectedIterationPath],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, WorkItem[]>()
    for (const column of columns) map.set(column.name, [])
    for (const item of filtered) {
      const key = columnKey(item)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return map
  }, [filtered, columns])

  const extraColumns = useMemo(
    () =>
      [...grouped.entries()]
        .filter(([name]) => !columns.some((column) => column.name === name))
        .map(([name, columnItems]) => ({ name, columnItems })),
    [grouped, columns],
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
    if (overData?.type === 'column') {
      targetColumn = String(overData.column)
    } else if (String(over.id).startsWith('column:')) {
      targetColumn = String(over.id).replace(/^column:/, '')
    } else {
      const overItem = filtered.find((entry) => String(entry.id) === String(over.id))
      if (overItem) targetColumn = columnKey(overItem)
    }

    if (!targetColumn || columnKey(item) === targetColumn) return
    move.mutate({ id: item.id, column: targetColumn, rev: item.rev })
  }

  const onDragCancel = () => setActive(null)

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500 dark:text-slate-400">Загрузка доски…</div>
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <WorkItemFilterBar items={items} filters={filters} onChange={setFilters} />
      <div className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} карточек</div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((column) => (
            <Column
              key={column.id}
              column={column}
              items={grouped.get(column.name) ?? []}
              onAdd={() => setQuickCreateOpen(true)}
            />
          ))}
          {extraColumns.map(({ name, columnItems }) => (
            <Column
              key={name}
              column={{ id: name, name, order: 999 }}
              items={columnItems}
              onAdd={() => setQuickCreateOpen(true)}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {active ? <WorkItemCard item={active} dragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
