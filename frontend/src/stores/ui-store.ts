import { create } from 'zustand'
import type { SyncStatus } from '../../shared/types'
import { EMPTY_FILTERS, type WorkItemFilters } from '@/lib/work-item-filters'

export type QuickCreateDraft = {
  type?: string
  title?: string
  bodyHtml?: string
  tags?: string[]
  priority?: string
  mattermostCardId?: string
  mattermostBoardId?: string
}

interface UiState {
  search: string
  filters: WorkItemFilters
  quickCreateOpen: boolean
  quickCreateDraft: QuickCreateDraft | null
  commandPaletteOpen: boolean
  shortcutsOpen: boolean
  settingsOpen: boolean
  connectionOpen: boolean
  connectionReady: boolean
  syncStatus: SyncStatus
  selectedIds: number[]
  /** Work item id to share to Mattermost; null = dialog closed. */
  mattermostShareWorkItemId: number | null
  setSearch: (value: string) => void
  setFilters: (filters: WorkItemFilters) => void
  setQuickCreateOpen: (open: boolean) => void
  openQuickCreate: (draft?: QuickCreateDraft) => void
  setCommandPaletteOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setConnectionOpen: (open: boolean) => void
  setConnectionReady: (ready: boolean) => void
  setSyncStatus: (status: SyncStatus) => void
  setSelectedIds: (ids: number[]) => void
  setMattermostShareWorkItemId: (id: number | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  search: '',
  filters: EMPTY_FILTERS,
  quickCreateOpen: false,
  quickCreateDraft: null,
  commandPaletteOpen: false,
  shortcutsOpen: false,
  settingsOpen: false,
  connectionOpen: false,
  connectionReady: false,
  syncStatus: { state: 'idle' },
  selectedIds: [],
  mattermostShareWorkItemId: null,
  setSearch: (search) => set({ search }),
  setFilters: (filters) => set({ filters }),
  setQuickCreateOpen: (quickCreateOpen) => set({ quickCreateOpen, quickCreateDraft: null }),
  openQuickCreate: (draft) => set({ quickCreateOpen: true, quickCreateDraft: draft ?? null }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setConnectionOpen: (connectionOpen) => set({ connectionOpen }),
  setConnectionReady: (connectionReady) => set({ connectionReady }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setSelectedIds: (selectedIds) => set({ selectedIds }),
  setMattermostShareWorkItemId: (mattermostShareWorkItemId) => set({ mattermostShareWorkItemId }),
}))
