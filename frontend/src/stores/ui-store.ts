import { create } from 'zustand'
import type { SyncStatus } from '../../shared/types'
import { EMPTY_FILTERS, type WorkItemFilters } from '@/lib/work-item-filters'

interface UiState {
  search: string
  filters: WorkItemFilters
  quickCreateOpen: boolean
  commandPaletteOpen: boolean
  shortcutsOpen: boolean
  settingsOpen: boolean
  connectionOpen: boolean
  connectionReady: boolean
  syncStatus: SyncStatus
  selectedIds: number[]
  setSearch: (value: string) => void
  setFilters: (filters: WorkItemFilters) => void
  setQuickCreateOpen: (open: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setConnectionOpen: (open: boolean) => void
  setConnectionReady: (ready: boolean) => void
  setSyncStatus: (status: SyncStatus) => void
  setSelectedIds: (ids: number[]) => void
}

export const useUiStore = create<UiState>((set) => ({
  search: '',
  filters: EMPTY_FILTERS,
  quickCreateOpen: false,
  commandPaletteOpen: false,
  shortcutsOpen: false,
  settingsOpen: false,
  connectionOpen: false,
  connectionReady: false,
  syncStatus: { state: 'idle' },
  selectedIds: [],
  setSearch: (search) => set({ search }),
  setFilters: (filters) => set({ filters }),
  setQuickCreateOpen: (quickCreateOpen) => set({ quickCreateOpen }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setConnectionOpen: (connectionOpen) => set({ connectionOpen }),
  setConnectionReady: (connectionReady) => set({ connectionReady }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setSelectedIds: (selectedIds) => set({ selectedIds }),
}))
