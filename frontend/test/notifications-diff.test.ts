import { describe, expect, it } from 'vitest'
import {
  CREATE_BURST_LIMIT,
  diffWorkItems,
  dropCreatedBurst,
  shouldBaselinePoll,
} from '../electron/main/notifications/diff'
import type { WorkItem } from '../shared/types'

function item(partial: Partial<WorkItem> & Pick<WorkItem, 'id' | 'title'>): WorkItem {
  return {
    rev: 1,
    type: 'Bug',
    state: 'Active',
    tags: [],
    ...partial,
  }
}

describe('diffWorkItems', () => {
  it('detects created items', () => {
    const changes = diffWorkItems(
      [],
      [item({ id: 1, title: 'New bug', assignedTo: 'Alex', assignedToUniqueName: 'alex@corp' })],
      {
        onlyAssignedToMe: false,
        enabledEvents: { 'workitem.created': true },
      },
    )
    expect(changes).toHaveLength(1)
    expect(changes[0].eventType).toBe('workitem.created')
  })

  it('notifies all creates even when onlyAssignedToMe', () => {
    const changes = diffWorkItems(
      [],
      [
        item({ id: 1, title: 'Mine', assignedToUniqueName: 'me@corp' }),
        item({ id: 2, title: 'Other', assignedToUniqueName: 'other@corp' }),
      ],
      {
        onlyAssignedToMe: true,
        currentUserUniqueName: 'me@corp',
        enabledEvents: { 'workitem.created': true },
      },
    )
    expect(changes.map((c) => c.item.id)).toEqual([1, 2])
  })

  it('filters updates by assignee when onlyAssignedToMe', () => {
    const before = [
      item({ id: 1, title: 'Mine', rev: 1, assignedToUniqueName: 'me@corp' }),
      item({ id: 2, title: 'Other', rev: 1, assignedToUniqueName: 'other@corp' }),
    ]
    const after = [
      item({ id: 1, title: 'Mine', rev: 2, state: 'Active', assignedToUniqueName: 'me@corp' }),
      item({ id: 2, title: 'Other', rev: 2, state: 'Active', assignedToUniqueName: 'other@corp' }),
    ]
    const changes = diffWorkItems(before, after, {
      onlyAssignedToMe: true,
      currentUserUniqueName: 'me@corp',
      enabledEvents: { 'workitem.updated': true },
    })
    expect(changes.map((c) => c.item.id)).toEqual([1])
  })

  it('detects assignment and state changes', () => {
    const before = [
      item({
        id: 7,
        title: 'Task',
        rev: 1,
        state: 'New',
        assignedToUniqueName: 'other@corp',
      }),
    ]
    const after = [
      item({
        id: 7,
        title: 'Task',
        rev: 2,
        state: 'Active',
        assignedToUniqueName: 'me@corp',
        assignedTo: 'Me',
      }),
    ]
    const changes = diffWorkItems(before, after, {
      onlyAssignedToMe: true,
      currentUserUniqueName: 'me@corp',
      enabledEvents: {
        'workitem.assigned': true,
        'workitem.updated': true,
      },
    })
    expect(changes.some((c) => c.eventType === 'workitem.assigned')).toBe(true)
    expect(changes.some((c) => c.eventType === 'workitem.updated')).toBe(true)
  })

  it('baselines empty/missing snapshots instead of treating the board as created', () => {
    expect(shouldBaselinePoll(null, 0)).toBe(false)
    expect(shouldBaselinePoll(null, 40)).toBe(true)
    expect(shouldBaselinePoll([], 40)).toBe(true)
    expect(shouldBaselinePoll([item({ id: 1, title: 'Existing' })], 40)).toBe(false)
  })

  it('drops a created burst after reconnect', () => {
    const burst = Array.from({ length: CREATE_BURST_LIMIT + 1 }, (_, index) => ({
      eventType: 'workitem.created' as const,
      item: item({ id: index + 1, title: `Card ${index + 1}` }),
      summary: `Создан #${index + 1}`,
    }))
    expect(dropCreatedBurst(burst)).toEqual([])
    expect(dropCreatedBurst(burst.slice(0, 2))).toHaveLength(2)
  })
})
