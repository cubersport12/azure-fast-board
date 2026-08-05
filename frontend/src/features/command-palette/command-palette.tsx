import { useNavigate } from 'react-router-dom'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useUiStore } from '@/stores/ui-store'

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen)
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const setQuickCreateOpen = useUiStore((s) => s.setQuickCreateOpen)
  const setConnectionOpen = useUiStore((s) => s.setConnectionOpen)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen)
  const navigate = useNavigate()

  const run = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Командная палитра"
      description="Быстрые команды Azure Fast Board"
      className="sm:max-w-xl"
    >
      <Command>
        <CommandInput placeholder="Введите команду…" />
        <CommandList>
          <CommandEmpty>Ничего не найдено</CommandEmpty>
          <CommandGroup heading="Навигация">
            <CommandItem onSelect={() => run(() => navigate('/board'))}>
              Открыть канбан-доску
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate('/work-items'))}>
              Открыть список рабочих элементов
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Действия">
            <CommandItem onSelect={() => run(() => setQuickCreateOpen(true))}>
              Быстрое создание
            </CommandItem>
            <CommandItem onSelect={() => run(() => setConnectionOpen(true))}>
              Подключить Azure DevOps Server
            </CommandItem>
            <CommandItem onSelect={() => run(() => setSettingsOpen(true))}>Настройки</CommandItem>
            <CommandItem onSelect={() => run(() => setShortcutsOpen(true))}>
              Горячие клавиши
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
