import {
  Columns3,
  Keyboard,
  ListTodo,
  Plus,
  Settings2,
  Wifi,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/primitives'
import { ThemeToggle } from '@/components/theme-toggle'
import { useConnection, useCurrentUser } from '@/hooks/use-azure'
import { useConnectionGate } from '@/hooks/use-connection-gate'
import { useAppHotkeys } from '@/hooks/use-app-hotkeys'
import { useNotificationsBridge } from '@/hooks/use-notifications-bridge'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui-store'
import { CommandPalette } from '@/features/command-palette/command-palette'
import { ConnectionDialog } from '@/features/connection/connection-dialog'
import {
  NotificationsBellButton,
  NotificationsDrawer,
} from '@/features/notifications/notifications-drawer'
import { QuickCreateDialog } from '@/features/quick-create/quick-create-dialog'
import { SendToMattermostDialog } from '@/features/mattermost/send-to-mattermost-dialog'
import { SettingsDialog, ShortcutsDialog } from '@/features/settings/settings-dialogs'
import { SprintNav } from '@/components/sprint-nav'

const SYNC_STATE_LABEL: Record<string, string> = {
  idle: 'Готово',
  syncing: 'Синхронизация',
  error: 'Ошибка',
  offline: 'Офлайн',
}

export function AppShell() {
  useAppHotkeys()
  useTheme()
  usePersistedFilters()
  useNotificationsBridge()
  const { ready, checking, blocked, errorMessage } = useConnectionGate()
  const search = useUiStore((s) => s.search)
  const setSearch = useUiStore((s) => s.setSearch)
  const syncStatus = useUiStore((s) => s.syncStatus)
  const setQuickCreateOpen = useUiStore((s) => s.setQuickCreateOpen)
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const setConnectionOpen = useUiStore((s) => s.setConnectionOpen)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen)
  const { data: connection } = useConnection()
  const { data: currentUser } = useCurrentUser()

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="flex w-56 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800">
          <div className="text-sm font-semibold tracking-tight">Azure Fast Board</div>
          <div className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
            {connection ? `${connection.project} · ${connection.collection}` : 'Нет подключения'}
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          <NavItem to="/board" icon={<Columns3 className="h-4 w-4" />} label="Канбан" disabled={!ready} />
          <NavItem
            to="/work-items"
            icon={<ListTodo className="h-4 w-4" />}
            label="Рабочие элементы"
            disabled={!ready}
          />
          <div className="my-1 border-t border-slate-100 pt-1 dark:border-slate-800">
            <NotificationsBellButton disabled={!ready} />
          </div>
          <SprintNav disabled={!ready} />
        </nav>
        <div className="space-y-1 border-t border-slate-100 p-2 dark:border-slate-800">
          <Button variant="ghost" className="w-full justify-start" onClick={() => setConnectionOpen(true)}>
            <Wifi className="h-4 w-4" /> Подключение
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start"
            disabled={!ready}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="h-4 w-4" /> Настройки
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start"
            disabled={!ready}
            onClick={() => setShortcutsOpen(true)}
          >
            <Keyboard className="h-4 w-4" /> Горячие клавиши
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <Input
            id="global-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск рабочих элементов…  /"
            className="max-w-md"
            disabled={!ready}
          />
          <div className="ml-auto flex items-center gap-2">
            {ready && currentUser?.displayName && (
              <span
                className="max-w-[240px] truncate text-sm font-medium text-slate-700 dark:text-slate-200"
                title={currentUser.uniqueName || currentUser.displayName}
              >
                {currentUser.displayName}
              </span>
            )}
            <span
              className={cn(
                'rounded-full px-2 py-1 text-[11px]',
                syncStatus.state === 'error' && 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
                syncStatus.state === 'syncing' &&
                  'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
                syncStatus.state === 'offline' &&
                  'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                syncStatus.state === 'idle' &&
                  'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
              )}
            >
              {syncStatus.message || SYNC_STATE_LABEL[syncStatus.state] || syncStatus.state}
            </span>
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              disabled={!ready}
              onClick={() => setCommandPaletteOpen(true)}
            >
              Ctrl+K
            </Button>
            <Button size="sm" disabled={!ready} onClick={() => setQuickCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Создать
            </Button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          {checking && (
            <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500 dark:text-slate-400">
              Проверка подключения к Azure DevOps Server…
            </div>
          )}
          {blocked && !checking && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                Требуется подключение
              </div>
              <div className="max-w-md text-sm text-slate-500 dark:text-slate-400">
                {errorMessage ||
                  'Настройте подключение к Azure DevOps Server, чтобы начать работу.'}
              </div>
              <Button onClick={() => setConnectionOpen(true)}>
                <Wifi className="h-4 w-4" /> Открыть подключение
              </Button>
            </div>
          )}
          {ready && <Outlet />}
        </main>
      </div>

      <QuickCreateDialog />
      <CommandPalette />
      <ConnectionDialog />
      <SettingsDialog />
      <ShortcutsDialog />
      <SendToMattermostDialog />
      <NotificationsDrawer />
    </div>
  )
}

function NavItem({
  to,
  icon,
  label,
  disabled,
}: {
  to: string
  icon: ReactNode
  label: string
  disabled?: boolean
}) {
  if (disabled) {
    return (
      <div className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-400 dark:text-slate-600">
        {icon}
        {label}
      </div>
    )
  }
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800',
          isActive && 'bg-sky-50 font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
