import type { NotificationEventType, WorkItem } from '../../../shared/types'

export interface WorkItemChange {
  eventType: NotificationEventType
  item: WorkItem
  previous?: WorkItem
  summary: string
}

function sameIdentity(a?: string, b?: string) {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase()
}

function matchesCurrentUser(item: WorkItem, uniqueName?: string, displayName?: string) {
  const candidates = [uniqueName, displayName]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean) as string[]
  if (!candidates.length) return true
  const assigned = [
    item.assignedToUniqueName?.trim().toLowerCase(),
    item.assignedTo?.trim().toLowerCase(),
  ].filter(Boolean) as string[]
  return assigned.some((value) => candidates.includes(value))
}

/** Diff two work-item snapshots into notification events. */
export function diffWorkItems(
  previous: WorkItem[],
  next: WorkItem[],
  options: {
    onlyAssignedToMe: boolean
    currentUserUniqueName?: string
    currentUserDisplayName?: string
    enabledEvents: Partial<Record<NotificationEventType, boolean>>
  },
): WorkItemChange[] {
  const prevMap = new Map(previous.map((item) => [item.id, item]))
  const nextMap = new Map(next.map((item) => [item.id, item]))
  const changes: WorkItemChange[] = []

  for (const item of next) {
    const before = prevMap.get(item.id)
    if (!before) {
      if (options.enabledEvents['workitem.created'] === false) continue
      if (
        options.onlyAssignedToMe &&
        !matchesCurrentUser(item, options.currentUserUniqueName, options.currentUserDisplayName)
      ) {
        continue
      }
      changes.push({
        eventType: 'workitem.created',
        item,
        summary: `Создан: ${item.type} #${item.id}`,
      })
      continue
    }

    const assignedChanged =
      !sameIdentity(before.assignedToUniqueName, item.assignedToUniqueName) ||
      !sameIdentity(before.assignedTo, item.assignedTo)

    if (assignedChanged && options.enabledEvents['workitem.assigned'] !== false) {
      const assignedToMe = matchesCurrentUser(
        item,
        options.currentUserUniqueName,
        options.currentUserDisplayName,
      )
      if (!options.onlyAssignedToMe || assignedToMe) {
        changes.push({
          eventType: 'workitem.assigned',
          item,
          previous: before,
          summary: assignedToMe
            ? `Назначен вам: ${item.type} #${item.id}`
            : `Смена исполнителя: ${item.type} #${item.id}`,
        })
      }
    }

    const updated =
      before.rev !== item.rev ||
      before.state !== item.state ||
      before.boardColumn !== item.boardColumn ||
      before.title !== item.title

    if (updated && options.enabledEvents['workitem.updated'] !== false) {
      if (
        options.onlyAssignedToMe &&
        !matchesCurrentUser(item, options.currentUserUniqueName, options.currentUserDisplayName)
      ) {
        continue
      }
      // Avoid duplicate noise when assignment was the only meaningful change.
      if (assignedChanged && before.state === item.state && before.title === item.title) {
        continue
      }
      const detail =
        before.state !== item.state
          ? `${before.state || '?'} → ${item.state || '?'}`
          : before.boardColumn !== item.boardColumn
            ? `колонка ${item.boardColumn || '?'}`
            : 'обновлён'
      changes.push({
        eventType: 'workitem.updated',
        item,
        previous: before,
        summary: `Обновлён #${item.id}: ${detail}`,
      })
    }
  }

  // Items removed from the visible query are ignored (filter/sprint changes).
  void nextMap
  return changes
}
