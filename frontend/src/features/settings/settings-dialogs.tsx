import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, Input, Label } from '@/components/ui/primitives'
import { queryKeys, useSettings } from '@/hooks/use-azure'
import { useUiStore } from '@/stores/ui-store'
import type {
  AppSettings,
  NotificationEventType,
  ServiceHookSubscription,
} from '../../../shared/types'

const EVENT_LABELS: Array<{ id: NotificationEventType; label: string }> = [
  { id: 'workitem.created', label: 'Создание work item' },
  { id: 'workitem.updated', label: 'Обновление work item' },
  { id: 'workitem.assigned', label: 'Назначение на меня / смена исполнителя' },
  { id: 'workitem.commented', label: 'Комментарии (через Service Hooks)' },
  { id: 'workitem.deleted', label: 'Удаление work item' },
]

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen)
  const setOpen = useUiStore((s) => s.setSettingsOpen)
  const { data } = useSettings()
  const qc = useQueryClient()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [mattermostUrl, setMattermostUrl] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [hookEvent, setHookEvent] = useState<NotificationEventType>('workitem.updated')
  const [hookUrl, setHookUrl] = useState('')
  const [hooksBusy, setHooksBusy] = useState(false)
  const [hooksMessage, setHooksMessage] = useState('')
  const [testMessage, setTestMessage] = useState('')

  const hooksQuery = useQuery({
    queryKey: ['serviceHooks'],
    queryFn: () => window.azureFastBoard!.listServiceHooks(),
    enabled: open && Boolean(window.azureFastBoard),
    retry: false,
  })

  useEffect(() => {
    if (data) setSettings(data)
  }, [data])

  useEffect(() => {
    if (!open) return
    void window.azureFastBoard.getAutoLaunch().then(setAutoLaunch)
    setMattermostUrl('')
    setSmtpPassword('')
    setApiToken('')
    setHooksMessage('')
    setTestMessage('')
  }, [open])

  useEffect(() => {
    if (!settings?.notifications.apiUrl) return
    if (hookUrl.trim()) return
    const base = settings.notifications.apiUrl.replace(/\/$/, '')
    setHookUrl(`${base}/hooks/azure`)
  }, [settings?.notifications.apiUrl, hookUrl])

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
          email: { ...notifications.providers.email, ...(patch.providers?.email ?? {}) },
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
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Уведомления</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Azure DevOps шлёт Service Hooks (HTTP) на Node API (`notifications-api`), а API раздаёт
              события по WebSocket клиентам. Без API можно использовать локальный опрос как fallback.
            </p>
          </div>

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

          <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <Label>Notifications API (WebSocket)</Label>
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
            <p className="text-xs text-slate-500">
              Electron подписывается на <code>/ws</code>. Service Hook в ADO должен указывать на{' '}
              <code>{'{apiUrl}/hooks/azure'}</code>.
            </p>
          </div>

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
            <Label>Провайдер: приложение</Label>
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
              Включён
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
              Мигать иконкой на панели задач (без разворачивания окна)
            </label>
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <Label>Провайдер: Mattermost</Label>
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
              Включён
              {notifications.providers.mattermost.webhookUrlConfigured ? (
                <span className="text-xs text-emerald-600">webhook задан</span>
              ) : (
                <span className="text-xs text-slate-500">webhook не задан</span>
              )}
            </label>
            <Input
              type="password"
              placeholder="Incoming Webhook URL"
              value={mattermostUrl}
              onChange={(e) => setMattermostUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <Label>Провайдер: почта (SMTP)</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notifications.providers.email.enabled}
                onChange={(e) =>
                  patchNotifications({
                    providers: {
                      ...notifications.providers,
                      email: { ...notifications.providers.email, enabled: e.target.checked },
                    },
                  })
                }
              />
              Включён
              {notifications.providers.email.passwordConfigured ? (
                <span className="text-xs text-emerald-600">пароль задан</span>
              ) : null}
            </label>
            <Input
              placeholder="Кому"
              value={notifications.providers.email.to}
              onChange={(e) =>
                patchNotifications({
                  providers: {
                    ...notifications.providers,
                    email: { ...notifications.providers.email, to: e.target.value },
                  },
                })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="SMTP host"
                value={notifications.providers.email.smtpHost}
                onChange={(e) =>
                  patchNotifications({
                    providers: {
                      ...notifications.providers,
                      email: { ...notifications.providers.email, smtpHost: e.target.value },
                    },
                  })
                }
              />
              <Input
                type="number"
                placeholder="Port"
                value={notifications.providers.email.smtpPort}
                onChange={(e) =>
                  patchNotifications({
                    providers: {
                      ...notifications.providers,
                      email: {
                        ...notifications.providers.email,
                        smtpPort: Number(e.target.value) || 587,
                      },
                    },
                  })
                }
              />
            </div>
            <Input
              placeholder="SMTP user"
              value={notifications.providers.email.smtpUser}
              onChange={(e) =>
                patchNotifications({
                  providers: {
                    ...notifications.providers,
                    email: { ...notifications.providers.email, smtpUser: e.target.value },
                  },
                })
              }
            />
            <Input
              type="password"
              placeholder="SMTP password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notifications.providers.email.smtpSecure}
                onChange={(e) =>
                  patchNotifications({
                    providers: {
                      ...notifications.providers,
                      email: {
                        ...notifications.providers.email,
                        smtpSecure: e.target.checked,
                      },
                    },
                  })
                }
              />
              TLS сразу (порт 465)
            </label>
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

        <section className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Service Hooks (Azure DevOps)
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Управление подписками на сервере. Webhook должен быть доступен с Azure DevOps Server
              (например Incoming Webhook Mattermost).
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={hookEvent}
              onChange={(e) => setHookEvent(e.target.value as NotificationEventType)}
            >
              {EVENT_LABELS.filter((e) => e.id !== 'workitem.assigned').map((event) => (
                <option key={event.id} value={event.id}>
                  {event.label}
                </option>
              ))}
            </select>
            <Input
              placeholder="Webhook URL"
              value={hookUrl}
              onChange={(e) => setHookUrl(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={hooksBusy || !hookUrl.trim()}
              onClick={async () => {
                setHooksBusy(true)
                setHooksMessage('')
                try {
                  await window.azureFastBoard.createServiceHook({
                    eventType: hookEvent,
                    webhookUrl: hookUrl.trim(),
                  })
                  setHookUrl('')
                  setHooksMessage('Подписка создана')
                  await qc.invalidateQueries({ queryKey: ['serviceHooks'] })
                } catch (error) {
                  setHooksMessage(error instanceof Error ? error.message : 'Ошибка создания')
                } finally {
                  setHooksBusy(false)
                }
              }}
            >
              Создать подписку
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={hooksBusy}
              onClick={async () => {
                await qc.invalidateQueries({ queryKey: ['serviceHooks'] })
              }}
            >
              Обновить список
            </Button>
          </div>
          {hooksMessage ? <p className="text-xs text-slate-500">{hooksMessage}</p> : null}
          {hooksQuery.isError ? (
            <p className="text-xs text-rose-600">
              {(hooksQuery.error as Error)?.message || 'Не удалось загрузить service hooks'}
            </p>
          ) : null}
          <div className="space-y-2">
            {(hooksQuery.data ?? []).map((hook: ServiceHookSubscription) => (
              <div
                key={hook.id}
                className="flex items-start justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800"
              >
                <div className="min-w-0">
                  <div className="font-medium">{hook.eventType}</div>
                  <div className="truncate text-xs text-slate-500">
                    {hook.consumerInputs?.url || hook.actionDescription || hook.id}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 px-2 text-xs"
                    onClick={async () => {
                      const result = await window.azureFastBoard.testServiceHook(hook.id)
                      setHooksMessage(result.message)
                    }}
                  >
                    Тест
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 px-2 text-xs"
                    onClick={async () => {
                      await window.azureFastBoard.deleteServiceHook(hook.id)
                      await qc.invalidateQueries({ queryKey: ['serviceHooks'] })
                    }}
                  >
                    Удалить
                  </Button>
                </div>
              </div>
            ))}
            {!hooksQuery.isLoading && (hooksQuery.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-slate-500">Подписок пока нет</p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          onClick={async () => {
            await window.azureFastBoard.updateSettings(settings)
            await window.azureFastBoard.setAutoLaunch(autoLaunch)
            if (mattermostUrl.trim() || smtpPassword || apiToken.trim()) {
              await window.azureFastBoard.setNotificationSecrets({
                mattermostWebhookUrl: mattermostUrl.trim() || undefined,
                smtpPassword: smtpPassword || undefined,
                notificationsApiToken: apiToken.trim() || undefined,
              })
            }
            await qc.invalidateQueries({ queryKey: queryKeys.settings })
            setOpen(false)
          }}
        >
          Сохранить
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
