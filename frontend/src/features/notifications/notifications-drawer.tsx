import { Bell, CheckCheck, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
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
        <Badge className="ml-auto min-w-[1.25rem] justify-center px-1.5 py-0.5 text-[10px]">
          {unread > 99 ? '99+' : unread}
        </Badge>
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

  const openItem = (item: UiNotification) => {
    markRead(item.id)
    void requireAzureApi()
      .markNotificationRead(item.id)
      .then((history) => useNotificationsStore.getState().seed(history))
      .catch(() => undefined)
    setDrawerOpen(false)

    const target = notificationOpenTarget(item)
    if (!target) return
    window.setTimeout(() => {
      navigate({ pathname: target.pathname, search: target.search || '' })
    }, 0)
  }

  return (
    <Sheet open={open} onOpenChange={setDrawerOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0 flex-1 text-left">
              <SheetTitle>Уведомления</SheetTitle>
              <SheetDescription>
                {unread > 0 ? `${unread} непрочитанных` : 'Все прочитаны'}
              </SheetDescription>
            </div>
            <Button
              size="icon-sm"
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
              size="icon-sm"
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
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-2">
            {items.length === 0 && (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">
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
                          ? 'border-transparent hover:bg-muted/60'
                          : 'border-primary/20 bg-primary/5 hover:bg-primary/10',
                      )}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        {!item.read && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                        )}
                        <span
                          className={cn(
                            'truncate text-[12px]',
                            item.read ? 'font-medium text-foreground/80' : 'font-semibold text-foreground',
                          )}
                        >
                          {formatted.title}
                        </span>
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                          {formatRelative(item.createdAt)}
                        </span>
                      </div>
                      {formatted.body && (
                        <div className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">
                          {formatted.body}
                        </div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
