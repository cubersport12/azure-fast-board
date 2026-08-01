import { Bell, CheckCheck, Trash2, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { requireAzureApi } from '@/lib/azure-api'
import {
  formatWindowsNotification,
  healNotificationIds,
  notificationOpenTarget,
} from '@/lib/notification-route'
import { cn, formatRelative } from '@/lib/utils'
import { useNotificationsStore, type UiNotification } from '@/stores/notifications-store'

export function NotificationsBellButton({ disabled }: { disabled?: boolean }) {
  const items = useNotificationsStore((s) => s.items)
  const drawerOpen = useNotificationsStore((s) => s.drawerOpen)
  const setDrawerOpen = useNotificationsStore((s) => s.setDrawerOpen)
  const unread = useMemo(() => items.filter((item) => !item.read).length, [items])

  return (
    <Button
      variant="ghost"
      className="relative w-full justify-start"
      disabled={disabled}
      aria-label={unread ? `Уведомления, непрочитанных: ${unread}` : 'Уведомления'}
      onClick={() => setDrawerOpen(!drawerOpen)}
    >
      <Bell className="h-4 w-4" />
      Уведомления
      {unread > 0 && (
        <span className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Button>
  )
}

export function NotificationsDrawer() {
  const navigate = useNavigate()
  const open = useNotificationsStore((s) => s.drawerOpen)
  const setDrawerOpen = useNotificationsStore((s) => s.setDrawerOpen)
  const items = useNotificationsStore((s) => s.items)
  const markRead = useNotificationsStore((s) => s.markRead)
  const markAllRead = useNotificationsStore((s) => s.markAllRead)
  const clear = useNotificationsStore((s) => s.clear)
  const unread = useMemo(() => items.filter((item) => !item.read).length, [items])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setDrawerOpen])

  if (!open) return null

  const openItem = (item: UiNotification) => {
    markRead(item.id)
    void requireAzureApi()
      .markNotificationRead(item.id)
      .then((history) => useNotificationsStore.getState().seed(history))
      .catch(() => undefined)
    setDrawerOpen(false)

    const target = notificationOpenTarget(item)
    if (!target) return
    // Close drawer first, then navigate (HashRouter).
    window.setTimeout(() => {
      navigate({ pathname: target.pathname, search: target.search || '' })
    }, 0)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/40 dark:bg-black/60"
        aria-label="Закрыть уведомления"
        onClick={() => setDrawerOpen(false)}
      />
      <aside
        className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
        aria-label="Уведомления"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Bell className="h-4 w-4 text-slate-500" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Уведомления</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {unread > 0 ? `${unread} непрочитанных` : 'Все прочитаны'}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={unread === 0}
            title="Прочитать все"
            onClick={() => {
              markAllRead()
              void requireAzureApi()
                .markAllNotificationsRead()
                .then((history) => useNotificationsStore.getState().seed(history))
                .catch(() => undefined)
            }}
          >
            <CheckCheck className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={items.length === 0}
            title="Очистить"
            onClick={() => {
              clear()
              void requireAzureApi()
                .clearNotifications()
                .then((history) => useNotificationsStore.getState().seed(history))
                .catch(() => undefined)
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDrawerOpen(false)} aria-label="Закрыть">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {items.length === 0 && (
            <div className="px-3 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Пока нет уведомлений
            </div>
          )}
          <ul className="space-y-1">
            {items.map((item) => {
              const formatted = formatWindowsNotification(healNotificationIds(item))
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2.5 text-left transition',
                      item.read
                        ? 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/80'
                        : 'border-sky-200 bg-sky-50/70 hover:bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40 dark:hover:bg-sky-950/60',
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      {!item.read && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden />
                      )}
                      <span
                        className={cn(
                          'truncate text-[12px]',
                          item.read
                            ? 'font-medium text-slate-700 dark:text-slate-300'
                            : 'font-semibold text-slate-900 dark:text-slate-100',
                        )}
                      >
                        {formatted.title}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                        {formatRelative(item.createdAt)}
                      </span>
                    </div>
                    {formatted.body && (
                      <div className="line-clamp-3 whitespace-pre-line text-xs text-slate-500 dark:text-slate-400">
                        {formatted.body}
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </aside>
    </div>
  )
}
