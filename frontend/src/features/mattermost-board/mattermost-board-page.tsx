import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, Download, ExternalLink, Folder, User } from 'lucide-react'
import type { AssigneeIdentity, MattermostBoardCard, MattermostCardImport } from '../../../shared/types'
import { Button } from '@/components/ui/button'
import { Badge, Dialog, Label } from '@/components/ui/primitives'
import { Dropdown } from '@/components/ui/dropdown'
import {
  queryKeys,
  useAreaPaths,
  useAssignees,
  useConnection,
  useIterationPaths,
  useSettings,
  useUpdateSettings,
  useWorkItems,
  useWorkItemTypes,
} from '@/hooks/use-azure'
import { getAzureApi, requireAzureApi } from '@/lib/azure-api'
import {
  appendMmImportFooter,
  cardIdFromMmTag,
  cn,
  findWorkItemByTitle,
  mattermostCardUrl,
  plainTextToHtml,
  workItemColor,
} from '@/lib/utils'
import { useUiStore } from '@/stores/ui-store'
import { buildWorkItemWebUrl } from '../../../shared/utils'

const mmKeys = {
  configured: ['mm-configured'] as const,
  teams: ['mm-teams'] as const,
  channels: (teamId: string) => ['mm-channels', teamId] as const,
  boards: (teamId: string, channelId: string) => ['mm-boards', teamId, channelId] as const,
  cards: (boardId: string) => ['mm-cards', boardId] as const,
  imports: ['mm-imports'] as const,
}

function importMap(items: MattermostCardImport[]) {
  return new Map(items.map((entry) => [entry.cardId, entry.workItemId]))
}

function typeAccentBorder(kind: string) {
  return /bug/i.test(kind) ? 'border-l-rose-500' : 'border-l-amber-500'
}

function hasOtherMmLink(tags: string[], cardId: string) {
  return tags.some((tag) => {
    const linkedId = cardIdFromMmTag(tag)
    return Boolean(linkedId) && linkedId !== cardId
  })
}

function typeForCard(kind: string, importType: string, typeNames: string[]) {
  const wanted = (kind || importType).trim()
  const exact = typeNames.find((name) => name.toLowerCase() === wanted.toLowerCase())
  if (exact) return exact
  if (/bug/i.test(wanted)) return typeNames.find((name) => /bug/i.test(name)) || importType
  if (/task/i.test(wanted)) return typeNames.find((name) => /task/i.test(name)) || importType
  return importType
}

function assigneeValue(person: AssigneeIdentity) {
  return person.uniqueName || person.displayName
}

export function MattermostBoardPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const search = useUiStore((s) => s.search)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const openQuickCreate = useUiStore((s) => s.openQuickCreate)
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const { data: types = [] } = useWorkItemTypes()
  const { data: workItems = [] } = useWorkItems()
  const { data: connection } = useConnection()

  const [teamId, setTeamId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [boardId, setBoardId] = useState('')
  const [importType, setImportType] = useState('Bug')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [importAllOpen, setImportAllOpen] = useState(false)

  const configuredQuery = useQuery({
    queryKey: mmKeys.configured,
    queryFn: () => requireAzureApi().isMattermostConfigured(),
  })
  const configured = configuredQuery.data === true

  const teamsQuery = useQuery({
    queryKey: mmKeys.teams,
    queryFn: () => requireAzureApi().listMattermostTeams(),
    enabled: configured,
  })
  const channelsQuery = useQuery({
    queryKey: mmKeys.channels(teamId),
    queryFn: () => requireAzureApi().listMattermostChannels(teamId),
    enabled: configured && Boolean(teamId),
  })
  const boardsQuery = useQuery({
    queryKey: mmKeys.boards(teamId, channelId),
    queryFn: () => requireAzureApi().listMattermostBoards(teamId, channelId),
    enabled: configured && Boolean(teamId && channelId),
  })
  const cardsQuery = useQuery({
    queryKey: mmKeys.cards(boardId),
    queryFn: () => requireAzureApi().listMattermostBoardCards(boardId),
    enabled: configured && Boolean(boardId),
  })
  const importsQuery = useQuery({
    queryKey: mmKeys.imports,
    queryFn: () => requireAzureApi().getMattermostImports(),
    enabled: configured,
  })

  useEffect(() => {
    if (!settings || hydrated) return
    setTeamId(settings.lastMattermostTeamId || '')
    setChannelId(settings.lastMattermostChannelId || '')
    setBoardId(settings.lastMattermostBoardId || '')
    setImportType(settings.lastMattermostImportType || 'Bug')
    setHydrated(true)
  }, [settings, hydrated])

  const persistSelection = (patch: {
    teamId?: string
    channelId?: string
    boardId?: string
    importType?: string
  }) => {
    void updateSettings.mutate({
      lastMattermostTeamId: patch.teamId ?? teamId,
      lastMattermostChannelId: patch.channelId ?? channelId,
      lastMattermostBoardId: patch.boardId ?? boardId,
      lastMattermostImportType: patch.importType ?? importType,
    })
  }

  const typeOptions = useMemo(() => {
    const names = types.map((entry) => entry.name)
    const wanted = names.filter((name) => /bug|task/i.test(name))
    const list = wanted.length ? wanted : ['Bug', 'Task']
    if (importType && !list.includes(importType)) list.unshift(importType)
    return list.map((name) => ({ value: name, label: name }))
  }, [types, importType])

  const linked = useMemo(() => importMap(importsQuery.data ?? []), [importsQuery.data])
  const cards = cardsQuery.data?.cards ?? []
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return cards.filter((card) => {
      if (statusFilter && card.status !== statusFilter) return false
      if (priorityFilter && card.priority !== priorityFilter) return false
      if (tagFilter && !card.tags.includes(tagFilter)) return false
      if (needle && !card.title.toLowerCase().includes(needle) && !card.id.toLowerCase().includes(needle)) {
        return false
      }
      return true
    })
  }, [cards, search, statusFilter, priorityFilter, tagFilter])

  const pending = filtered.filter((card) => !linked.has(card.id))

  const importMutation = useMutation({
    mutationFn: (input: {
      cardIds: string[]
      iterationPath?: string
      assignedTo?: string
      areaPath?: string
    }) =>
      requireAzureApi().importMattermostCards({
        boardId,
        cardIds: input.cardIds,
        type: importType,
        iterationPath: input.iterationPath,
        assignedTo: input.assignedTo,
        areaPath: input.areaPath,
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: mmKeys.imports }),
        qc.invalidateQueries({ queryKey: queryKeys.workItems }),
      ])
      setError('')
      setImportAllOpen(false)
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Не удалось импортировать')
    },
  })

  const openInTfsBrowser = async (workItemId: number) => {
    if (!connection) return
    const item = workItems.find((entry) => entry.id === workItemId)
    const url = item?.url?.includes('_workitems')
      ? item.url
      : buildWorkItemWebUrl(connection, workItemId)
    await getAzureApi()?.openExternal(url)
  }

  const importOne = async (card: MattermostBoardCard) => {
    setRowBusy(card.id)
    setError('')
    try {
      const tagged = workItems.find((item) =>
        item.tags.some((tag) => cardIdFromMmTag(tag) === card.id),
      )
      if (tagged) {
        await requireAzureApi().linkMattermostCard({
          cardId: card.id,
          workItemId: tagged.id,
          boardId,
        })
        await qc.invalidateQueries({ queryKey: mmKeys.imports })
        return
      }
      const taken = new Set(linked.values())
      const byTitle = findWorkItemByTitle(card.title, workItems, taken)
      if (byTitle && !hasOtherMmLink(byTitle.tags, card.id)) {
        await requireAzureApi().linkMattermostCard({
          cardId: card.id,
          workItemId: byTitle.id,
          boardId,
        })
        await qc.invalidateQueries({ queryKey: mmKeys.imports })
        return
      }
      openQuickCreate({
        type: typeForCard(card.kind, importType, types.map((entry) => entry.name)),
        title: card.title,
        bodyHtml: appendMmImportFooter(
          card.description.trim() ? plainTextToHtml(card.description) : '',
          mattermostCardUrl(
            settings?.notifications?.providers?.mattermost?.baseUrl || '',
            boardId,
            card.id,
            teamId,
          ),
        ),
        tags: card.tags,
        priority: card.priority.match(/[1-4]/)?.[0] || '',
        mattermostCardId: card.id,
        mattermostBoardId: boardId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось импортировать')
    } finally {
      setRowBusy(null)
    }
  }

  if (configuredQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Проверка Mattermost…</div>
  }

  if (!configured) {
    return (
      <div className="flex h-full flex-col items-start gap-3 p-6">
        <h1 className="text-lg font-semibold">Mattermost board</h1>
        <p className="max-w-lg text-sm text-muted-foreground">
          Укажите URL, логин и пароль Mattermost в настройках, чтобы загрузить доски канала.
        </p>
        <Button size="sm" onClick={() => setSettingsOpen(true)}>
          Открыть настройки
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 p-4">
      <div className="grid shrink-0 grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] items-end gap-2">
        <Dropdown
          className="w-full flex-none"
          label="Команда"
          value={teamId}
          options={(teamsQuery.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
          onChange={(next) => {
            setTeamId(next)
            setChannelId('')
            setBoardId('')
            persistSelection({ teamId: next, channelId: '', boardId: '' })
          }}
          placeholder="Команда MM"
          searchable={false}
          allowEmpty={false}
        />
        <Dropdown
          className="w-full flex-none"
          label="Канал"
          value={channelId}
          options={(channelsQuery.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
          onChange={(next) => {
            setChannelId(next)
            setBoardId('')
            persistSelection({ channelId: next, boardId: '' })
          }}
          placeholder="Канал"
          searchable
          allowEmpty={false}
          disabled={!teamId}
        />
        <Dropdown
          className="w-full flex-none"
          label="Доска"
          value={boardId}
          options={(boardsQuery.data ?? []).map((item) => ({ value: item.id, label: item.title }))}
          onChange={(next) => {
            setBoardId(next)
            setStatusFilter('')
            setPriorityFilter('')
            setTagFilter('')
            persistSelection({ boardId: next })
          }}
          placeholder="Доска"
          searchable
          allowEmpty={false}
          disabled={!channelId}
        />
        <Dropdown
          className="w-full flex-none"
          label="Тип в TFS"
          value={importType}
          options={typeOptions}
          onChange={(next) => {
            setImportType(next)
            persistSelection({ importType: next })
          }}
          searchable={false}
          allowEmpty={false}
        />
        <Dropdown
          className="w-full flex-none"
          label="Статус"
          value={statusFilter}
          options={(cardsQuery.data?.statuses ?? []).map((value) => ({ value, label: value }))}
          onChange={setStatusFilter}
          placeholder="Все"
          emptyLabel="Все"
          searchable={false}
          allowEmpty
          disabled={!boardId}
        />
        <Dropdown
          className="w-full flex-none"
          label="Приоритет"
          value={priorityFilter}
          options={(cardsQuery.data?.priorities ?? []).map((value) => ({ value, label: value }))}
          onChange={setPriorityFilter}
          placeholder="Все"
          emptyLabel="Все"
          searchable={false}
          allowEmpty
          disabled={!boardId}
        />
        <Dropdown
          className="w-full flex-none"
          label="Метка"
          value={tagFilter}
          options={(cardsQuery.data?.tags ?? []).map((value) => ({ value, label: value }))}
          onChange={setTagFilter}
          placeholder="Все"
          emptyLabel="Все"
          searchable
          allowEmpty
          disabled={!boardId}
        />
        <Button
          size="sm"
          className="mb-0.5 w-full sm:w-auto"
          disabled={!boardId || pending.length === 0 || importMutation.isPending}
          onClick={() => setImportAllOpen(true)}
        >
          <Download className="h-4 w-4" />
          {importMutation.isPending ? 'Импорт…' : `Импортировать все(${pending.length})`}
        </Button>
      </div>

      <div className="shrink-0 text-sm text-muted-foreground">
        {cardsQuery.isLoading && boardId
          ? 'Загрузка карточек…'
          : `${filtered.length} карточек${pending.length ? ` · ${pending.length} не в TFS` : ''}`}
      </div>
      {error && <div className="text-sm text-destructive">{error}</div>}
      {(teamsQuery.error || boardsQuery.error || cardsQuery.error) && (
        <div className="text-sm text-destructive">
          {(teamsQuery.error || boardsQuery.error || cardsQuery.error) instanceof Error
            ? (teamsQuery.error || boardsQuery.error || cardsQuery.error)?.message
            : 'Не удалось загрузить Mattermost Boards'}
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid shrink-0 grid-cols-[minmax(220px,1fr)_100px_140px_120px_140px_170px] border-b border-border bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Название</span>
          <span>Тип</span>
          <span>Статус</span>
          <span>Приоритет</span>
          <span>Метки</span>
          <span>TFS</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {!boardId && (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">
              Выберите команду, канал и доску
            </div>
          )}
          {boardId && filtered.length === 0 && !cardsQuery.isLoading && (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">Нет карточек</div>
          )}
          {filtered.map((card) => {
            const workItemId = linked.get(card.id)
            const busy = rowBusy === card.id
            const kind = card.kind || 'Task'
            return (
              <div
                key={card.id}
                className={cn(
                  'grid grid-cols-[minmax(220px,1fr)_100px_140px_120px_140px_170px] border-b border-border/60 border-l-[3px] px-3 py-2 text-sm last:border-b-0',
                  typeAccentBorder(kind),
                  workItemId && 'cursor-pointer hover:bg-muted/40',
                )}
                onClick={() => {
                  if (workItemId) navigate(`/work-items/${workItemId}`)
                }}
              >
                <div className="flex min-w-0 items-center gap-2 pr-2">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', workItemColor(kind))} />
                  <span className="truncate font-medium" title={card.title}>
                    {card.title}
                  </span>
                </div>
                <div className="flex items-center text-muted-foreground">{kind}</div>
                <div className="flex items-center text-muted-foreground">{card.status || '—'}</div>
                <div className="flex items-center">{card.priority || '—'}</div>
                <div className="flex items-center gap-1 overflow-hidden">
                  {card.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="secondary" className="max-w-20 truncate">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center justify-end gap-1">
                  {workItemId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation()
                        void openInTfsBrowser(workItemId)
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Открыть в TFS
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || importMutation.isPending}
                      onClick={(event) => {
                        event.stopPropagation()
                        void importOne(card)
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                      {busy ? '…' : 'Импортировать'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <ImportAllDialog
        open={importAllOpen}
        count={pending.length}
        pending={importMutation.isPending}
        onClose={() => setImportAllOpen(false)}
        onConfirm={async (defaults) => {
          await importMutation.mutateAsync({
            cardIds: pending.map((card) => card.id),
            iterationPath: defaults.iterationPath,
            assignedTo: defaults.assignedTo,
            areaPath: defaults.areaPath,
          })
          void updateSettings.mutate({ lastAssignee: defaults.assignedTo || '' })
        }}
      />
    </div>
  )
}

function ImportAllDialog({
  open,
  count,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean
  count: number
  pending: boolean
  onClose: () => void
  onConfirm: (defaults: {
    iterationPath?: string
    assignedTo?: string
    areaPath?: string
  }) => Promise<void>
}) {
  const { data: connection } = useConnection()
  const { data: settings } = useSettings()
  const { data: teamAssignees = [] } = useAssignees()
  const { data: areaPaths } = useAreaPaths()
  const { data: iterationPaths } = useIterationPaths()
  const [iterationPath, setIterationPath] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [areaPath, setAreaPath] = useState('')
  const [people, setPeople] = useState<AssigneeIdentity[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef<number | null>(null)

  const areas = areaPaths?.areas ?? []
  const rootPath = areaPaths?.rootPath || connection?.project || ''
  const defaultAreaPath = areaPaths?.defaultPath || rootPath
  const selectedIteration = settings?.selectedIterationPath?.trim() || ''
  const defaultAssignee = settings?.lastAssignee ?? ''

  useEffect(() => {
    if (!open) return
    setIterationPath(selectedIteration)
    setAssignedTo(defaultAssignee)
    setAreaPath(defaultAreaPath || rootPath)
    setPeople(teamAssignees)
  }, [open, selectedIteration, defaultAssignee, defaultAreaPath, rootPath, teamAssignees])

  useEffect(() => {
    return () => {
      if (searchTimer.current != null) window.clearTimeout(searchTimer.current)
    }
  }, [])

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
    if (selectedIteration && !byPath.has(selectedIteration.toLowerCase())) {
      byPath.set(selectedIteration.toLowerCase(), {
        value: selectedIteration,
        label: selectedIteration.split('\\').pop() || selectedIteration,
      })
    }
    return [...byPath.values()].sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  }, [iterationPaths?.iterations, settings?.subscribedIterations, selectedIteration])

  const handleSearch = useCallback(
    (query: string) => {
      const q = query.trim()
      if (searchTimer.current != null) window.clearTimeout(searchTimer.current)
      if (q.length < 2) {
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
      description: person.uniqueName,
    }))
    if (assignedTo && !mapped.some((option) => option.value === assignedTo)) {
      mapped.unshift({ value: assignedTo, label: assignedTo, description: undefined })
    }
    return mapped
  }, [people, assignedTo])

  return (
    <Dialog open={open} onClose={onClose} title="Импорт в TFS">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {count} карточек. Выберите итерацию, исполнителя и область по умолчанию.
        </p>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 text-primary/70" /> Итерация
          </Label>
          <Dropdown
            value={iterationPath}
            options={iterationOptions}
            onChange={setIterationPath}
            placeholder="Не выбрано"
            emptyLabel="Не выбрано"
            searchPlaceholder="Поиск итерации…"
            allowEmpty
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3.5 w-3.5 text-primary/70" /> Исполнитель
          </Label>
          <Dropdown
            value={assignedTo}
            options={assigneeOptions}
            onChange={setAssignedTo}
            onSearch={handleSearch}
            placeholder="Не назначен"
            emptyLabel="Не назначен"
            searchPlaceholder={searching ? 'Поиск…' : 'Найти человека…'}
            allowEmpty
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Folder className="h-3.5 w-3.5 text-primary/70" /> Область
          </Label>
          <Dropdown
            value={
              !areaPath || (rootPath && areaPath.toLowerCase() === rootPath.toLowerCase())
                ? ''
                : areaPath
            }
            options={areas
              .filter(
                (area) => !rootPath || area.path.toLowerCase() !== rootPath.toLowerCase(),
              )
              .map((area) => ({
                value: area.path,
                label: area.name,
              }))}
            onChange={(next) => setAreaPath(next || rootPath || '')}
            placeholder="Не указано"
            emptyLabel="Не указано"
            searchPlaceholder="Поиск Area…"
            allowEmpty
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || count === 0}
            onClick={() =>
              void onConfirm({
                iterationPath: iterationPath.trim() || undefined,
                assignedTo: assignedTo.trim() || undefined,
                areaPath: areaPath.trim() || undefined,
              })
            }
          >
            <Download className="h-4 w-4" />
            {pending ? 'Импорт…' : 'Импортировать'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
