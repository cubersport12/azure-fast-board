import { create } from 'zustand'
import { notificationBelongsToWorkItem } from '../../shared/notifications-format'
import type { BoardNotification } from '../../shared/types'

export type UiNotification = BoardNotification & { read: boolean }

interface NotificationsState {
  items: UiNotification[]
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  seed: (items: BoardNotification[]) => void
  push: (item: BoardNotification) => void
  markRead: (id: string) => void
  markReadByWorkItemId: (workItemId: number) => void
  markAllRead: () => void
  clear: () => void
  unreadCount: () => number
}

function withRead(item: BoardNotification, read = false): UiNotification {
  return { ...item, read: item.read ?? read }
}

function sortItems(items: UiNotification[]) {
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

/** In-memory mirror of electron-store history (main process is source of truth). */
export const useNotificationsStore = create<NotificationsState>()((set, get) => ({
  items: [],
  drawerOpen: false,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  seed: (incoming) => {
    set({
      items: sortItems(incoming.map((item) => withRead(item, Boolean(item.read)))),
    })
  },
  push: (item) => {
    set((state) => {
      if (state.items.some((entry) => entry.id === item.id)) {
        return state
      }
      return {
        items: sortItems([withRead(item, Boolean(item.read)), ...state.items]),
      }
    })
  },
  markRead: (id) => {
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
    }))
  },
  markReadByWorkItemId: (workItemId) => {
    set((state) => ({
      items: state.items.map((item) =>
        notificationBelongsToWorkItem(item, workItemId)
          ? { ...item, workItemId, read: true }
          : item,
      ),
    }))
  },
  markAllRead: () => {
    set((state) => ({
      items: state.items.map((item) => (item.read ? item : { ...item, read: true })),
    }))
  },
  clear: () => set({ items: [] }),
  unreadCount: () => get().items.filter((item) => !item.read).length,
}))
