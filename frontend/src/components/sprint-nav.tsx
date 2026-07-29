import { Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Dialog } from '@/components/ui/primitives'
import {
  useIterationPaths,
  useSettings,
  useUpdateSettings,
} from '@/hooks/use-azure'
import { cn } from '@/lib/utils'
import type { SubscribedIteration } from '../../shared/types'

const EMPTY_SUBSCRIBED: SubscribedIteration[] = []

export function SprintNav({ disabled }: { disabled?: boolean }) {
  const { data: settings } = useSettings()
  const { data: iterationPaths } = useIterationPaths()
  const updateSettings = useUpdateSettings()
  const [addOpen, setAddOpen] = useState(false)
  const [picked, setPicked] = useState('')

  const subscribed = settings?.subscribedIterations ?? EMPTY_SUBSCRIBED
  const selectedPath = settings?.selectedIterationPath ?? ''

  const availableOptions = useMemo(() => {
    const iterations = iterationPaths?.iterations ?? []
    return iterations
      .filter(
        (iteration) =>
          !subscribed.some((entry) => entry.path.toLowerCase() === iteration.path.toLowerCase()),
      )
      .map((iteration) => ({
        value: iteration.path,
        label: iteration.name,
        description: iteration.path,
      }))
  }, [iterationPaths?.iterations, subscribed])

  const persist = (patch: {
    subscribedIterations?: SubscribedIteration[]
    selectedIterationPath?: string
  }) => {
    void updateSettings.mutateAsync(patch)
  }

  const select = (path: string) => {
    if (disabled || path === selectedPath) return
    persist({ selectedIterationPath: path })
  }

  const unsubscribe = (path: string) => {
    const next = subscribed.filter((entry) => entry.path.toLowerCase() !== path.toLowerCase())
    persist({
      subscribedIterations: next,
      selectedIterationPath:
        selectedPath.toLowerCase() === path.toLowerCase() ? '' : selectedPath,
    })
  }

  const subscribe = (path: string) => {
    const nextPath = path.trim()
    if (!nextPath) return
    if (subscribed.some((entry) => entry.path.toLowerCase() === nextPath.toLowerCase())) {
      setAddOpen(false)
      setPicked('')
      return
    }
    const match = iterationPaths?.iterations.find(
      (iteration) => iteration.path.toLowerCase() === nextPath.toLowerCase(),
    )
    const entry: SubscribedIteration = {
      path: match?.path || nextPath,
      name: match?.name || nextPath.split('\\').pop() || nextPath,
    }
    persist({
      subscribedIterations: [...subscribed, entry],
      selectedIterationPath: entry.path,
    })
    setAddOpen(false)
    setPicked('')
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      <div className="mb-1 flex items-center justify-between px-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Спринты
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          disabled={disabled}
          title="Добавить спринт"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <button
        type="button"
        disabled={disabled}
        className={cn(
          'flex w-full items-center rounded-md px-3 py-1.5 text-left text-sm',
          disabled
            ? 'text-slate-400 dark:text-slate-600'
            : !selectedPath
              ? 'bg-sky-50 font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300'
              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800',
        )}
        onClick={() => select('')}
      >
        Не выбрано
      </button>

      {subscribed.map((sprint) => {
        const active = selectedPath.toLowerCase() === sprint.path.toLowerCase()
        return (
          <div
            key={sprint.path}
            className={cn(
              'group flex items-center gap-1 rounded-md',
              active && 'bg-sky-50 dark:bg-sky-950',
            )}
          >
            <button
              type="button"
              disabled={disabled}
              title={sprint.path}
              className={cn(
                'min-w-0 flex-1 truncate px-3 py-1.5 text-left text-sm',
                disabled
                  ? 'text-slate-400 dark:text-slate-600'
                  : active
                    ? 'font-medium text-sky-700 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
              onClick={() => select(sprint.path)}
            >
              {sprint.name}
            </button>
            {!disabled && (
              <button
                type="button"
                className="mr-1 rounded p-1 text-slate-400 opacity-0 hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                title="Отписаться"
                aria-label={`Отписаться от ${sprint.name}`}
                onClick={() => unsubscribe(sprint.path)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )
      })}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Добавить спринт">
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Подписка хранится только локально и не меняет настройки команды в TFS.
          </p>
          <SearchableSelect
            value={picked}
            options={availableOptions}
            onChange={setPicked}
            placeholder="Выберите итерацию"
            emptyLabel="Не выбрано"
            searchPlaceholder="Поиск итерации…"
            suggestionsLabel="Suggestions"
            allowEmpty={false}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!picked || updateSettings.isPending}
              onClick={() => subscribe(picked)}
            >
              Добавить
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
