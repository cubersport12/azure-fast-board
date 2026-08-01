import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, Input, Label } from '@/components/ui/primitives'
import { queryKeys, useSettings } from '@/hooks/use-azure'
import { useUiStore } from '@/stores/ui-store'
import type { AppSettings, NotificationEventType } from '../../../shared/types'

const EVENT_LABELS: Array<{ id: NotificationEventType; label: string }> = [
  { id: 'workitem.created', label: 'Создание work item' },
  { id: 'workitem.updated', label: 'Обновление work item' },
  { id: 'workitem.assigned', label: 'Назначение на меня / смена исполнителя' },
  { id: 'workitem.commented', label: 'Комментарии' },
  { id: 'workitem.deleted', label: 'Удаление work item' },
]

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen)
  const setOpen = useUiStore((s) => s.setSettingsOpen)
  const { data } = useSettings()
  const qc = useQueryClient()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [mattermostPassword, setMattermostPassword] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const [mattermostMessage, setMattermostMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) setSettings(data)
  }, [data])

  useEffect(() => {
    if (!open) return
    void window.azureFastBoard.getAutoLaunch().then(setAutoLaunch)
    setMattermostPassword('')
    setApiToken('')
    setTestMessage('')
    setMattermostMessage('')
    setSaving(false)
  }, [open])

  if (!settings) return null

  const notifications = settings.notifications

  const patchNotifications = (patch: Partial<AppSettings['notifications']>) => {
    setSettings({
      ...settings,
      notifications: {
        ...notifications,
        ...patch,
        events: { ...notifications.events, ...(patch.events ?? {}) },
        providers: {
          app: { ...notifications.providers.app, ...(patch.providers?.app ?? {}) },
          mattermost: {
            ...notifications.providers.mattermost,
            ...(patch.providers?.mattermost ?? {}),
          },
          email: notifications.providers.email,
        },
      },
    })
  }

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Настройки" wide>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Общие</h3>
          <div className="space-y-1">
            <Label>Тема</Label>
            <select
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={settings.theme}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  theme: e.target.value as AppSettings['theme'],
                })
              }
            >
              <option value="light">Светлая</option>
              <option value="dark">Тёмная</option>
              <option value="system">Системная</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>Горячая клавиша показа окна</Label>
            <Input
              value={settings.globalHotkey}
              onChange={(e) => setSettings({ ...settings, globalHotkey: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Горячая клавиша быстрого создания</Label>
            <Input
              value={settings.quickCreateHotkey}
              onChange={(e) => setSettings({ ...settings, quickCreateHotkey: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.launchMinimized}
              onChange={(e) => setSettings({ ...settings, launchMinimized: e.target.checked })}
            />
            Запускать свёрнутым в трей
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.hideToTrayOnClose}
              onChange={(e) => setSettings({ ...settings, hideToTrayOnClose: e.target.checked })}
            />
            Скрывать в трей при закрытии
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.insecureTls}
              onChange={(e) => setSettings({ ...settings, insecureTls: e.target.checked })}
            />
            Разрешить небезопасный TLS (корпоративные сертификаты)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoLaunch}
              onChange={(e) => setAutoLaunch(e.target.checked)}
            />
            Запускать вместе с Windows
          </label>
        </section>

        <section className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Уведомления</h3>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notifications.enabled}
              onChange={(e) => patchNotifications({ enabled: e.target.checked })}
            />
            Включить уведомления
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notifications.onlyAssignedToMe}
              onChange={(e) => patchNotifications({ onlyAssignedToMe: e.target.checked })}
            />
            Только мои work item / назначения мне
          </label>

          <div className="space-y-1">
            <Label>События</Label>
            <div className="space-y-1">
              {EVENT_LABELS.map((event) => (
                <label key={event.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={notifications.events[event.id]}
                    onChange={(e) =>
                      patchNotifications({
                        events: { ...notifications.events, [event.id]: e.target.checked },
                      })
                    }
                  />
                  {event.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <Label>В приложении</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notifications.providers.app.enabled}
                onChange={(e) =>
                  patchNotifications({
                    providers: {
                      ...notifications.providers,
                      app: { ...notifications.providers.app, enabled: e.target.checked },
                    },
                  })
                }
              />
              Включены
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notifications.providers.app.showToast}
                onChange={(e) =>
                  patchNotifications({
                    providers: {
                      ...notifications.providers,
                      app: { ...notifications.providers.app, showToast: e.target.checked },
                    },
                  })
                }
              />
              Системный toast
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notifications.providers.app.flashTaskbar}
                onChange={(e) =>
                  patchNotifications({
                    providers: {
                      ...notifications.providers,
                      app: { ...notifications.providers.app, flashTaskbar: e.target.checked },
                    },
                  })
                }
              />
              Мигать иконкой на панели задач
            </label>
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <Label>Mattermost</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notifications.providers.mattermost.enabled}
                onChange={(e) =>
                  patchNotifications({
                    providers: {
                      ...notifications.providers,
                      mattermost: {
                        ...notifications.providers.mattermost,
                        enabled: e.target.checked,
                      },
                    },
                  })
                }
              />
              Уведомления в MM
              {notifications.providers.mattermost.passwordConfigured ? (
                <span className="text-xs text-emerald-600">пароль задан</span>
              ) : (
                <span className="text-xs text-slate-500">пароль не задан</span>
              )}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notifications.providers.mattermost.notifyOnCreate}
                disabled={
                  !notifications.providers.mattermost.baseUrl.trim() ||
                  !notifications.providers.mattermost.loginId.trim() ||
                  !notifications.providers.mattermost.passwordConfigured
                }
                onChange={(e) =>
                  patchNotifications({
                    providers: {
                      ...notifications.providers,
                      mattermost: {
                        ...notifications.providers.mattermost,
                        notifyOnCreate: e.target.checked,
                      },
                    },
                  })
                }
              />
              Уведомлять в MM при создании карточки
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Если включено и MM настроен — после создания карточки себе в MM уйдёт сообщение с
              названием, описанием, картинками и ссылкой на TFS.
            </p>
            <Input
              placeholder="URL сервера Mattermost (https://mm.example.com)"
              value={notifications.providers.mattermost.baseUrl}
              onChange={(e) =>
                patchNotifications({
                  providers: {
                    ...notifications.providers,
                    mattermost: {
                      ...notifications.providers.mattermost,
                      baseUrl: e.target.value,
                    },
                  },
                })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Логин (email / username)"
                value={notifications.providers.mattermost.loginId}
                autoComplete="username"
                onChange={(e) =>
                  patchNotifications({
                    providers: {
                      ...notifications.providers,
                      mattermost: {
                        ...notifications.providers.mattermost,
                        loginId: e.target.value,
                      },
                    },
                  })
                }
              />
              <Input
                type="password"
                placeholder={
                  notifications.providers.mattermost.passwordConfigured
                    ? 'Пароль (оставьте пустым, чтобы не менять)'
                    : 'Пароль'
                }
                value={mattermostPassword}
                autoComplete="current-password"
                onChange={(e) => setMattermostPassword(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Пароль хранится зашифрованно. После сохранения — вход и тестовое сообщение себе.
            </p>
            {mattermostMessage ? (
              <p
                className={
                  mattermostMessage.startsWith('Mattermost: вход')
                    ? 'text-xs text-emerald-600'
                    : 'text-xs text-rose-600'
                }
              >
                {mattermostMessage}
              </p>
            ) : null}
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <Label>Notifications API (опционально)</Label>
            <Input
              placeholder="http://172.22.91.47:8787"
              value={notifications.apiUrl}
              onChange={(e) => patchNotifications({ apiUrl: e.target.value })}
            />
            <Input
              type="password"
              placeholder="AUTH_TOKEN API (если задан на сервере)"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await window.azureFastBoard.testNotification()
                  setTestMessage('Тестовое уведомление отправлено')
                } catch (error) {
                  setTestMessage(error instanceof Error ? error.message : 'Ошибка теста')
                }
              }}
            >
              Проверить уведомление
            </Button>
            {testMessage ? (
              <span className="self-center text-xs text-slate-500">{testMessage}</span>
            ) : null}
          </div>
        </section>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            setMattermostMessage('')
            try {
              await window.azureFastBoard.updateSettings(settings)
              await window.azureFastBoard.setAutoLaunch(autoLaunch)
              if (mattermostPassword || apiToken.trim()) {
                await window.azureFastBoard.setNotificationSecrets({
                  mattermostPassword: mattermostPassword || undefined,
                  notificationsApiToken: apiToken.trim() || undefined,
                })
              }

              const mm = settings.notifications.providers.mattermost
              const hasMmLogin =
                Boolean(mm.baseUrl.trim()) &&
                Boolean(mm.loginId.trim()) &&
                (Boolean(mattermostPassword) || mm.passwordConfigured)
              if (hasMmLogin) {
                const result = await window.azureFastBoard.connectMattermost({
                  baseUrl: mm.baseUrl.trim(),
                  loginId: mm.loginId.trim(),
                  password: mattermostPassword || undefined,
                })
                setMattermostMessage(result.message)
                await qc.invalidateQueries({ queryKey: queryKeys.settings })
                if (!result.ok) return
              } else {
                await qc.invalidateQueries({ queryKey: queryKeys.settings })
              }
              setOpen(false)
            } catch (error) {
              setMattermostMessage(
                error instanceof Error ? error.message : 'Не удалось сохранить настройки Mattermost',
              )
            } finally {
              setSaving(false)
            }
          }}
        >
          {saving ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </div>
    </Dialog>
  )
}

export function ShortcutsDialog() {
  const open = useUiStore((s) => s.shortcutsOpen)
  const setOpen = useUiStore((s) => s.setShortcutsOpen)
  const rows = [
    ['Ctrl+Shift+Space', 'Показать / скрыть приложение'],
    ['Ctrl+Shift+N', 'Быстрое создание (глобально)'],
    ['C', 'Быстрое создание'],
    ['Ctrl+K', 'Палитра команд'],
    ['/', 'Фокус на поиск'],
    ['Esc', 'Закрыть диалоги'],
    ['Ctrl+V', 'Вставить скриншот в создание / комментарии'],
  ]

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Горячие клавиши">
      <div className="space-y-2">
        {rows.map(([keys, label]) => (
          <div
            key={keys}
            className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800"
          >
            <span>{label}</span>
            <kbd className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100">
              {keys}
            </kbd>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
