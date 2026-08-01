import type { BoardNotification } from '../../shared/types'
import {
  formatWindowsNotification,
  healNotificationIds,
  notificationBelongsToWorkItem,
  notificationOpenRoute,
} from '../../shared/notifications-format'

export {
  formatWindowsNotification,
  healNotificationIds,
  notificationBelongsToWorkItem,
  notificationOpenRoute,
}

/** Shared open target for drawer + Windows toast navigation. */
export function notificationOpenTarget(
  notification: Pick<
    BoardNotification,
    'eventType' | 'workItemId' | 'commentId' | 'body' | 'title' | 'workItemTitle'
  >,
): { pathname: string; search?: string } | null {
  const route = notificationOpenRoute(
    healNotificationIds(notification as BoardNotification),
  )
  if (!route) return null
  const [pathname, search = ''] = route.split('?')
  return {
    pathname,
    search: search ? `?${search}` : '',
  }
}
