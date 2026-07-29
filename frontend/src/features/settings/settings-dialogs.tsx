import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, Input, Label } from '@/components/ui/primitives'
import { queryKeys, useSettings } from '@/hooks/use-azure'
import { useUiStore } from '@/stores/ui-store'
import type { AppSettings } from '../../../shared/types'

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen)
  const setOpen = useUiStore((s) => s.setSettingsOpen)
  const { data } = useSettings()
  const qc = useQueryClient()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [autoLaunch, setAutoLaunch] = useState(false)

  useEffect(() => {
    if (data) setSettings(data)
  }, [data])

  useEffect(() => {
    if (!open) return
    void window.azureFastBoard.getAutoLaunch().then(setAutoLaunch)
  }, [open])

  if (!settings) return null

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Настройки">
      <div className="space-y-3">
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
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          onClick={async () => {
            await window.azureFastBoard.updateSettings(settings)
            await window.azureFastBoard.setAutoLaunch(autoLaunch)
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
          <div key={keys} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
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
