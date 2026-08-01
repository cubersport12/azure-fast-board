import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/hooks/use-azure'
import { getAzureApi } from '@/lib/azure-api'
import { useNotificationsStore } from '@/stores/notifications-store'

function shouldRefreshList(eventType: string) {
  const type = eventType.toLowerCase()
  return type === 'workitem.created' || type === 'workitem.deleted'
}

/** Bridges Electron notification IPC → drawer store + list invalidation. */
export function useNotificationsBridge() {
  const qc = useQueryClient()
  const seed = useNotificationsStore((s) => s.seed)
  const push = useNotificationsStore((s) => s.push)

  useEffect(() => {
    const api = getAzureApi()
    if (!api) return

    let cancelled = false
    void api.getNotificationHistory().then((history) => {
      if (cancelled) return
      if (Array.isArray(history)) seed(history)
    })

    const unsubNotify = api.onNotification((notification) => {
      push(notification)
      if (shouldRefreshList(String(notification.eventType))) {
        void qc.invalidateQueries({ queryKey: queryKeys.workItems })
      } else if (notification.workItemId) {
        void qc.invalidateQueries({ queryKey: queryKeys.workItem(notification.workItemId) })
      }
    })

    const unsubInvalidate = api.onWorkItemsInvalidate?.((payload) => {
      void qc.invalidateQueries({ queryKey: queryKeys.workItems })
      if (payload?.reason) {
        void qc.invalidateQueries({ queryKey: ['workItem'] })
      }
    })

    return () => {
      cancelled = true
      unsubNotify()
      unsubInvalidate?.()
    }
  }, [qc, seed, push])
}
