import type { BoardNotification } from './types'

function stripMarkdown(value?: string) {
  if (!value) return ''
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[*_~`]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function detailWithoutTitle(detail: string, wiTitle: string) {
  if (!detail) return ''
  if (!wiTitle) return detail
  const trimmed = detail.trim()
  const title = wiTitle.trim()
  if (trimmed === title) return ''
  if (trimmed.startsWith(`${title}\n`)) return trimmed.slice(title.length).trim()
  if (trimmed.startsWith(`${title} `)) return trimmed.slice(title.length).trim()
  return trimmed
}

function inferWorkItemKind(notification: BoardNotification): string {
  const raw = notification.workItemType?.trim()
  const fromText = `${raw || ''} ${notification.workItemTitle || ''} ${notification.body || ''} ${notification.title || ''}`
  const key = fromText.toLowerCase()
  if (/\bbug\b|баг/.test(key)) return 'баг'
  if (/\btask\b|таск/.test(key)) return 'таск'
  if (key.includes('user story') || /\bstory\b/.test(key)) return 'User Story'
  if (key.includes('feature')) return 'Feature'
  if (/\bissue\b/.test(key)) return 'Issue'
  if (raw) return raw
  return 'карточка'
}

function headline(action: string, kind: string, id: string) {
  return [action, kind, id].filter(Boolean).join(' ')
}

/** Title/body for Windows toast and in-app notifications list. */
export function formatWindowsNotification(notification: BoardNotification): {
  title: string
  body: string
} {
  const type = String(notification.eventType).toLowerCase()
  const id = notification.workItemId ? `#${notification.workItemId}` : ''
  const kind = inferWorkItemKind(notification)
  const wiTitle = notification.workItemTitle?.trim() || ''
  const rawDetail = stripMarkdown(notification.body)
  const detail = detailWithoutTitle(rawDetail, wiTitle)

  if (type.includes('commented')) {
    return {
      title: headline('Комментарий:', kind, id),
      body: [wiTitle, detail].filter(Boolean).join('\n') || 'Новый комментарий',
    }
  }
  if (type.includes('created')) {
    return {
      title: headline('Создан:', kind, id),
      body: wiTitle || detail || 'Новая карточка',
    }
  }
  if (type.includes('deleted')) {
    return {
      title: headline('Удалён:', kind, id),
      body: wiTitle || detail || 'Карточка удалена',
    }
  }
  if (type.includes('assigned')) {
    return {
      title: headline('Назначен:', kind, id),
      body: wiTitle || detail || 'Изменён исполнитель',
    }
  }
  if (type.includes('updated')) {
    return {
      title: headline('Изменён:', kind, id),
      body: [wiTitle, detail].filter(Boolean).join('\n') || 'Карточка изменена',
    }
  }

  return {
    title: headline('Уведомление:', kind, id) || 'Azure Fast Board',
    body: [wiTitle, detail].filter(Boolean).join('\n') || 'Событие Azure DevOps',
  }
}

export function notificationOpenRoute(notification: BoardNotification): string | null {
  const type = String(notification.eventType).toLowerCase()
  if (type.includes('deleted')) return null
  const workItemId = Number(notification.workItemId)
  if (!Number.isFinite(workItemId) || workItemId <= 0) return null
  if (type.includes('commented') && notification.commentId) {
    return `/work-items/${workItemId}?commentId=${notification.commentId}`
  }
  return `/work-items/${workItemId}`
}

/** Pull work item id from ADO message / URL when payload fields are incomplete. */
export function extractWorkItemIdFromText(text?: string | null): number | undefined {
  if (!text) return undefined
  const patterns = [
    /workitems\/edit\/(\d+)/i,
    /workItems\/(\d+)/i,
    /\/edit\/(\d+)/i,
    /[?&]id=(\d+)/i,
    /\b(?:Bug|Task|User Story|Feature|PBI|Issue)\s+#?(\d{2,})\b/i,
    /#(\d{2,})\b/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const id = Number(match[1])
      if (Number.isFinite(id) && id > 0) return id
    }
  }
  return undefined
}

/** Whether notification is about this work item (after healing incomplete payloads). */
export function notificationBelongsToWorkItem(
  notification: BoardNotification,
  workItemId: number,
): boolean {
  if (!Number.isFinite(workItemId) || workItemId <= 0) return false
  return healNotificationIds(notification).workItemId === workItemId
}

/**
 * Repair incomplete/mis-mapped comment payloads so open-route works.
 * On-prem often sends work item id as commentId and omits workItemId.
 */
export function healNotificationIds<T extends BoardNotification>(notification: T): T {
  let workItemId = notification.workItemId
  let commentId = notification.commentId
  const type = String(notification.eventType).toLowerCase()

  if (!workItemId) {
    workItemId = extractWorkItemIdFromText(notification.body)
      || extractWorkItemIdFromText(notification.title)
      || extractWorkItemIdFromText(notification.workItemTitle)
  }

  if (
    type.includes('commented') &&
    !workItemId &&
    typeof commentId === 'number' &&
    commentId > 0
  ) {
    workItemId = commentId
    commentId = undefined
  }

  // Mis-mapped on-prem payload: same id used for both fields.
  if (
    type.includes('commented') &&
    workItemId &&
    commentId &&
    commentId === workItemId
  ) {
    commentId = undefined
  }

  if (workItemId === notification.workItemId && commentId === notification.commentId) {
    return notification
  }

  return { ...notification, workItemId, commentId }
}
