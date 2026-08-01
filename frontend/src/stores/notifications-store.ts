import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BoardNotification } from '../../shared/types'

const MAX_ITEMS = 100

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

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      items: [],
      drawerOpen: false,
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
      seed: (incoming) => {
        const known = new Map(get().items.map((item) => [item.id, item]))
        const merged: UiNotification[] = []
        for (const item of incoming) {
          const prev = known.get(item.id)
          merged.push(withRead(item, prev?.read ?? false))
          known.delete(item.id)
        }
        // Keep local-only items (e.g. arrived after history fetch) at the front if newer.
        for (const leftover of known.values()) merged.push(leftover)
        merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        set({ items: merged.slice(0, MAX_ITEMS) })
      },
      push: (item) => {
        set((state) => {
          if (state.items.some((entry) => entry.id === item.id)) {
            return state
          }
          return {
            items: [withRead(item, false), ...state.items].slice(0, MAX_ITEMS),
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
            item.workItemId === workItemId ? { ...item, read: true } : item,
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
    }),
    {
      name: 'afb-notifications',
      partialize: (state) => ({
        items: state.items.map((item) => ({
          id: item.id,
          eventType: item.eventType,
          title: item.title,
          body: item.body,
          workItemId: item.workItemId,
          workItemTitle: item.workItemTitle,
          workItemType: item.workItemType,
          commentId: item.commentId,
          createdAt: item.createdAt,
          source: item.source,
          read: item.read,
        })),
      }),
    },
  ),
)
