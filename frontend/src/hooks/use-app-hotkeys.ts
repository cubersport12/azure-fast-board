import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SyncStatus } from '../../shared/types'
import { isHotkey, matchesAccelerator } from '@/lib/hotkeys'
import { isTypingTarget } from '@/lib/utils'
import { useSettings } from '@/hooks/use-azure'
import { useUiStore } from '@/stores/ui-store'

export function useAppHotkeys() {
  const navigate = useNavigate()
  const { data: settings } = useSettings()
  const setQuickCreateOpen = useUiStore((s) => s.setQuickCreateOpen)
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen)
  const setConnectionOpen = useUiStore((s) => s.setConnectionOpen)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const setSearch = useUiStore((s) => s.setSearch)
  const quickCreateOpen = useUiStore((s) => s.quickCreateOpen)
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen)
  const shortcutsOpen = useUiStore((s) => s.shortcutsOpen)
  const connectionOpen = useUiStore((s) => s.connectionOpen)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const connectionReady = useUiStore((s) => s.connectionReady)

  useEffect(() => {
    const api = window.azureFastBoard
    if (!api) {
      console.error('Preload bridge unavailable: window.azureFastBoard is undefined')
      return
    }
    const unsubs = [
      api.onShowQuickCreate(() => {
        if (useUiStore.getState().connectionReady) setQuickCreateOpen(true)
      }),
      api.onShowCommandPalette(() => {
        if (useUiStore.getState().connectionReady) setCommandPaletteOpen(true)
      }),
      api.onNavigate((route: string) => {
        if (useUiStore.getState().connectionReady) navigate(route)
      }),
      api.onSyncStatus((status: SyncStatus) => {
        useUiStore.getState().setSyncStatus(status)
      }),
    ]
    return () => unsubs.forEach((unsub) => unsub())
  }, [navigate, setCommandPaletteOpen, setQuickCreateOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Prefer event.code so RU/EN layouts share the same physical shortcuts.
      if (event.code === 'Escape' || event.key === 'Escape') {
        if (quickCreateOpen) setQuickCreateOpen(false)
        else if (commandPaletteOpen) setCommandPaletteOpen(false)
        else if (shortcutsOpen) setShortcutsOpen(false)
        else if (connectionOpen && connectionReady) setConnectionOpen(false)
        else if (settingsOpen) setSettingsOpen(false)
        return
      }

      if (!connectionReady) return

      if (isHotkey(event, 'KeyK', { mod: true })) {
        event.preventDefault()
        setCommandPaletteOpen(true)
        return
      }

      // When window is focused, also honor configured global accelerators via code
      // (covers cases where Electron globalShortcut fails on non-Latin layouts).
      if (settings?.quickCreateHotkey && matchesAccelerator(event, settings.quickCreateHotkey)) {
        if (!isTypingTarget(event.target)) {
          event.preventDefault()
          setQuickCreateOpen(true)
          return
        }
      }

      if (isTypingTarget(event.target)) return

      if (isHotkey(event, 'KeyC')) {
        event.preventDefault()
        setQuickCreateOpen(true)
        return
      }
      if (isHotkey(event, 'Slash')) {
        event.preventDefault()
        document.getElementById('global-search')?.focus()
        return
      }
      if (isHotkey(event, 'Slash', { shift: true })) {
        event.preventDefault()
        setShortcutsOpen(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    commandPaletteOpen,
    connectionOpen,
    connectionReady,
    quickCreateOpen,
    setCommandPaletteOpen,
    setConnectionOpen,
    setQuickCreateOpen,
    setSettingsOpen,
    setShortcutsOpen,
    settings?.quickCreateHotkey,
    settingsOpen,
    shortcutsOpen,
  ])

  void setSearch
}
