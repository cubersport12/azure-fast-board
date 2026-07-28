import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { useUiStore } from '@/stores/ui-store'

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen)
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const setQuickCreateOpen = useUiStore((s) => s.setQuickCreateOpen)
  const setConnectionOpen = useUiStore((s) => s.setConnectionOpen)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen)
  const navigate = useNavigate()

  if (!open) return null

  const run = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 p-4 pt-[12vh]">
      <button className="absolute inset-0" aria-label="Закрыть" onClick={() => setOpen(false)} />
      <Command className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <Command.Input
          autoFocus
          placeholder="Введите команду…"
          className="h-12 w-full border-b border-slate-100 bg-transparent px-4 text-sm text-slate-900 outline-none dark:border-slate-800 dark:text-slate-100"
        />
        <Command.List className="max-h-80 overflow-auto p-2">
          <Command.Empty className="px-3 py-6 text-sm text-slate-500 dark:text-slate-400">Ничего не найдено</Command.Empty>
          <Command.Group heading="Навигация" className="px-2 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Command.Item
              className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-800 aria-selected:bg-sky-50 dark:text-slate-100 dark:aria-selected:bg-sky-950"
              onSelect={() => run(() => navigate('/board'))}
            >
              Открыть канбан-доску
            </Command.Item>
            <Command.Item
              className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-800 aria-selected:bg-sky-50 dark:text-slate-100 dark:aria-selected:bg-sky-950"
              onSelect={() => run(() => navigate('/work-items'))}
            >
              Открыть список рабочих элементов
            </Command.Item>
          </Command.Group>
          <Command.Group heading="Действия" className="px-2 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Command.Item
              className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-800 aria-selected:bg-sky-50 dark:text-slate-100 dark:aria-selected:bg-sky-950"
              onSelect={() => run(() => setQuickCreateOpen(true))}
            >
              Быстрое создание
            </Command.Item>
            <Command.Item
              className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-800 aria-selected:bg-sky-50 dark:text-slate-100 dark:aria-selected:bg-sky-950"
              onSelect={() => run(() => setConnectionOpen(true))}
            >
              Подключить Azure DevOps Server
            </Command.Item>
            <Command.Item
              className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-800 aria-selected:bg-sky-50 dark:text-slate-100 dark:aria-selected:bg-sky-950"
              onSelect={() => run(() => setSettingsOpen(true))}
            >
              Настройки
            </Command.Item>
            <Command.Item
              className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-800 aria-selected:bg-sky-50 dark:text-slate-100 dark:aria-selected:bg-sky-950"
              onSelect={() => run(() => setShortcutsOpen(true))}
            >
              Горячие клавиши
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  )
}
