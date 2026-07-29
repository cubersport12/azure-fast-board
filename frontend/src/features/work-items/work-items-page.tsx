import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { WorkItem } from '../../../shared/types'
import { WorkItemFilterBar } from '@/components/work-item-filter-bar'
import { Badge } from '@/components/ui/primitives'
import { useConnection, useCurrentUser, useSettings, useWorkItems } from '@/hooks/use-azure'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { applyWorkItemFilters } from '@/lib/work-item-filters'
import { formatRelative, workItemColor, cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui-store'

export function WorkItemsPage() {
  const { data = [], isLoading } = useWorkItems()
  const { data: connection } = useConnection()
  const { data: currentUser } = useCurrentUser()
  const { data: settings } = useSettings()
  const search = useUiStore((s) => s.search)
  const { filters, setFilters } = usePersistedFilters()
  const navigate = useNavigate()
  const [sorting, setSorting] = useState<SortingState>([{ id: 'changedDate', desc: true }])
  const parentRef = useRef<HTMLDivElement>(null)

  const me = useMemo(
    () => ({
      username: connection?.username,
      displayName: currentUser?.displayName,
      uniqueName: currentUser?.uniqueName,
    }),
    [connection?.username, currentUser?.displayName, currentUser?.uniqueName],
  )

  const columns = useMemo<ColumnDef<WorkItem>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => <span className="font-mono text-xs text-slate-500">#{row.original.id}</span>,
        size: 70,
      },
      {
        accessorKey: 'title',
        header: 'Название',
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', workItemColor(row.original.type))} />
            <span className="truncate font-medium text-slate-900 dark:text-slate-100">
              {row.original.title}
            </span>
          </div>
        ),
        size: 360,
      },
      { accessorKey: 'type', header: 'Тип', size: 120 },
      { accessorKey: 'state', header: 'Состояние', size: 110 },
      {
        accessorKey: 'assignedTo',
        header: 'Исполнитель',
        cell: ({ getValue }) => <span className="truncate">{String(getValue() || '—')}</span>,
        size: 160,
      },
      {
        id: 'tags',
        header: 'Теги',
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.tags.slice(0, 2).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        ),
        size: 140,
      },
      {
        accessorKey: 'changedDate',
        header: 'Изменён',
        cell: ({ getValue }) => formatRelative(String(getValue() || '')),
        size: 100,
      },
    ],
    [],
  )

  const filtered = useMemo(
    () =>
      applyWorkItemFilters(
        data,
        search,
        filters,
        me,
        settings?.selectedIterationPath,
      ),
    [data, search, filters, me, settings?.selectedIterationPath],
  )

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const rows = table.getRowModel().rows
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 12,
  })

  if (isLoading) return <div className="p-6 text-sm text-slate-500 dark:text-slate-400">Загрузка рабочих элементов…</div>

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <WorkItemFilterBar items={data} filters={filters} onChange={setFilters} />
      <div className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} рабочих элементов</div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="grid grid-cols-[70px_1fr_120px_110px_160px_140px_100px] border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
          {table.getHeaderGroups()[0]?.headers.map((header) => (
            <button
              key={header.id}
              className="text-left"
              onClick={header.column.getToggleSortingHandler()}
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
            </button>
          ))}
        </div>
        <div ref={parentRef} className="max-h-[calc(100vh-320px)] overflow-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => navigate(`/work-items/${row.original.id}`)}
                  className="absolute left-0 grid w-full grid-cols-[70px_1fr_120px_110px_160px_140px_100px] border-b border-slate-100 px-3 text-left text-sm hover:bg-sky-50 dark:border-slate-800 dark:hover:bg-sky-950/40"
                  style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <div key={cell.id} className="flex items-center truncate py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
