import type { BoardNotification } from '../../../shared/types'

function stripMarkdown(value?: string) {
  if (!value) return ''
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[*_~`]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Title/body for Windows Action Center toast. */
export function formatWindowsNotification(notification: BoardNotification): {
  title: string
  body: string
} {
  const type = String(notification.eventType).toLowerCase()
  const id = notification.workItemId ? `#${notification.workItemId}` : ''
  const wiTitle = notification.workItemTitle?.trim() || ''
  const detail = stripMarkdown(notification.body)

  if (type.includes('commented')) {
    return {
      title: `Комментарий ${id}`.trim(),
      body: [wiTitle, detail].filter(Boolean).join('\n') || 'Новый комментарий',
    }
  }
  if (type.includes('created')) {
    return {
      title: `Создан элемент ${id}`.trim(),
      body: wiTitle || detail || 'Новый work item',
    }
  }
  if (type.includes('deleted')) {
    return {
      title: `Удалён элемент ${id}`.trim(),
      body: wiTitle || detail || 'Work item удалён',
    }
  }
  if (type.includes('assigned')) {
    return {
      title: `Назначение ${id}`.trim(),
      body: wiTitle || detail || 'Изменён исполнитель',
    }
  }
  if (type.includes('updated')) {
    return {
      title: `Обновление ${id}`.trim(),
      body: [wiTitle, detail].filter(Boolean).join('\n') || notification.title,
    }
  }

  return {
    title: stripMarkdown(notification.title) || `Уведомление ${id}`.trim(),
    body: [wiTitle, detail].filter(Boolean).join('\n') || 'Событие Azure DevOps',
  }
}

export function notificationOpenRoute(notification: BoardNotification): string | null {
  const type = String(notification.eventType).toLowerCase()
  if (type.includes('deleted')) return null
  if (!notification.workItemId) return null
  if (type.includes('commented') && notification.commentId) {
    return `/work-items/${notification.workItemId}?commentId=${notification.commentId}`
  }
  return `/work-items/${notification.workItemId}`
}
