import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, Label } from '@/components/ui/primitives'
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown'
import { useSettings, useUpdateSettings } from '@/hooks/use-azure'
import { getAzureApi } from '@/lib/azure-api'
import { useUiStore } from '@/stores/ui-store'

type TargetMode = 'channel' | 'user'

export function SendToMattermostDialog() {
  const workItemId = useUiStore((s) => s.mattermostShareWorkItemId)
  const setWorkItemId = useUiStore((s) => s.setMattermostShareWorkItemId)
  const open = workItemId != null && workItemId > 0

  const [mode, setMode] = useState<TargetMode>('channel')
  const [teamId, setTeamId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [userId, setUserId] = useState('')
  const [teams, setTeams] = useState<DropdownOption[]>([])
  const [channels, setChannels] = useState<DropdownOption[]>([])
  const [users, setUsers] = useState<DropdownOption[]>([])
  const [favoriteUsers, setFavoriteUsers] = useState<DropdownOption[]>([])
  const [loadingLists, setLoadingLists] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()

  const userOptions = useMemo(() => {
    const byValue = new Map<string, DropdownOption>()
    for (const entry of favoriteUsers) byValue.set(entry.value, entry)
    for (const entry of users) byValue.set(entry.value, entry)
    return [...byValue.values()]
  }, [favoriteUsers, users])

  useEffect(() => {
    if (!open) return
    setMode('channel')
    setTeamId('')
    setChannelId('')
    setUserId('')
    setChannels([])
    setUsers([])
    setMessage('')
    setSending(false)

    const api = getAzureApi()
    if (!api?.listMattermostTeams) return
    setLoadingLists(true)
    void api
      .listMattermostTeams()
      .then((items) =>
        setTeams(items.map((item) => ({ value: item.id, label: item.name, description: item.displayName }))),
      )
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : 'Не удалось загрузить проекты Mattermost'),
      )
      .finally(() => setLoadingLists(false))
  }, [open, workItemId])

  // Resolve favorite MM users by id → FIO / @username (legacy favorites stored only ids).
  useEffect(() => {
    if (!open || mode !== 'user') return
    const favs = settings?.selectFavorites?.['mattermost-user'] ?? []
    const ids = favs.map((entry) => entry.value).filter(Boolean)
    if (!ids.length) {
      setFavoriteUsers([])
      return
    }
    const api = getAzureApi()
    if (!api?.getMattermostUsersByIds) return
    let cancelled = false
    void api
      .getMattermostUsersByIds(ids)
      .then((items) => {
        if (cancelled) return
        const resolved = items.map((item) => ({
          value: item.id,
          label: item.name,
          description: item.displayName,
        }))
        setFavoriteUsers(resolved)

        const byId = new Map(resolved.map((entry) => [entry.value, entry]))
        let changed = false
        const nextFavs = favs.map((fav) => {
          const live = byId.get(fav.value)
          if (!live) return fav
          if (fav.label === live.label && (fav.description || '') === (live.description || '')) {
            return fav
          }
          changed = true
          return {
            value: live.value,
            label: live.label,
            ...(live.description ? { description: live.description } : {}),
          }
        })
        if (changed) {
          updateSettings.mutate({
            selectFavorites: {
              ...(settings?.selectFavorites ?? {}),
              'mattermost-user': nextFavs,
            },
          })
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open, mode, settings?.selectFavorites, updateSettings])

  useEffect(() => {
    if (!open || mode !== 'channel' || !teamId) {
      setChannels([])
      setChannelId('')
      return
    }
    const api = getAzureApi()
    if (!api?.listMattermostChannels) return
    setLoadingLists(true)
    void api
      .listMattermostChannels(teamId)
      .then((items) =>
        setChannels(
          items.map((item) => ({ value: item.id, label: item.name, description: item.displayName })),
        ),
      )
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : 'Не удалось загрузить каналы Mattermost'),
      )
      .finally(() => setLoadingLists(false))
  }, [open, mode, teamId])

  const canSend = useMemo(() => {
    if (!workItemId) return false
    if (mode === 'channel') return Boolean(teamId && channelId)
    return Boolean(userId)
  }, [workItemId, mode, teamId, channelId, userId])

  const onSearchUsers = (query: string) => {
    const api = getAzureApi()
    if (!api?.searchMattermostUsers) return
    void api
      .searchMattermostUsers(query)
      .then((items) =>
        setUsers(
          items.map((item) => ({
            value: item.id,
            label: item.name,
            description: item.displayName,
          })),
        ),
      )
      .catch(() => undefined)
  }

  return (
    <Dialog
      open={open}
      onClose={() => setWorkItemId(null)}
      title={`Отправить #${workItemId ?? ''} в Mattermost`}
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === 'channel' ? 'default' : 'outline'}
            onClick={() => setMode('channel')}
          >
            Канал
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'user' ? 'default' : 'outline'}
            onClick={() => {
              setMode('user')
              onSearchUsers('')
            }}
          >
            Пользователь
          </Button>
        </div>

        {mode === 'channel' ? (
          <>
            <div className="space-y-1">
              <Label>Проект</Label>
              <Dropdown
                id="mattermost-team"
                favoritesKey="mattermost-team"
                value={teamId}
                options={teams}
                onChange={(next) => {
                  setTeamId(next)
                  setChannelId('')
                }}
                placeholder={loadingLists && !teams.length ? 'Загрузка…' : 'Выберите проект'}
                emptyLabel="Не выбран"
                allowEmpty={false}
                disabled={loadingLists && !teams.length}
              />
            </div>
            <div className="space-y-1">
              <Label>Канал</Label>
              <Dropdown
                id="mattermost-channel"
                favoritesKey="mattermost-channel"
                value={channelId}
                options={channels}
                onChange={setChannelId}
                placeholder={!teamId ? 'Сначала выберите проект' : 'Выберите канал'}
                emptyLabel="Не выбран"
                allowEmpty={false}
                disabled={!teamId}
              />
            </div>
          </>
        ) : (
          <div className="space-y-1">
            <Label>Пользователь</Label>
            <Dropdown
              id="mattermost-user"
              favoritesKey="mattermost-user"
              value={userId}
              options={userOptions}
              onChange={setUserId}
              onSearch={onSearchUsers}
              placeholder="Найти пользователя"
              emptyLabel="Не выбран"
              allowEmpty={false}
              searchPlaceholder="Имя или @username"
            />
          </div>
        )}

        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          В сообщение попадут название, описание, изображения и ссылка на карточку в TFS.
        </p>

        {message ? (
          <p
            className={
              message.startsWith('Отправлено')
                ? 'text-xs text-emerald-600'
                : 'text-xs text-rose-600'
            }
          >
            {message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => setWorkItemId(null)} disabled={sending}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={!canSend || sending}
            onClick={async () => {
              if (!workItemId) return
              const api = getAzureApi()
              if (!api?.shareWorkItemToMattermost) return
              setSending(true)
              setMessage('')
              try {
                const result = await api.shareWorkItemToMattermost(
                  mode === 'channel'
                    ? { workItemId, mode: 'channel', teamId, channelId }
                    : { workItemId, mode: 'user', userId },
                )
                setMessage(result.message)
                if (result.ok) {
                  window.setTimeout(() => setWorkItemId(null), 700)
                }
              } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Не удалось отправить')
              } finally {
                setSending(false)
              }
            }}
          >
            {sending ? 'Отправка…' : 'Отправить'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
