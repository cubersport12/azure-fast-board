import { beforeEach, describe, expect, it } from 'vitest'
import { useNotificationsStore } from '../src/stores/notifications-store'

describe('notifications store', () => {
  beforeEach(() => {
    useNotificationsStore.setState({ items: [], drawerOpen: false })
  })

  it('pushes unread and marks read by work item', () => {
    useNotificationsStore.getState().push({
      id: 'a',
      eventType: 'workitem.created',
      title: 'Created',
      body: 'Bug',
      workItemId: 5,
      createdAt: '2026-07-30T06:00:00Z',
    })
    expect(useNotificationsStore.getState().unreadCount()).toBe(1)

    useNotificationsStore.getState().markReadByWorkItemId(5)
    expect(useNotificationsStore.getState().items[0]?.read).toBe(true)
    expect(useNotificationsStore.getState().unreadCount()).toBe(0)
  })

  it('dedupes by id', () => {
    const item = {
      id: 'same',
      eventType: 'workitem.updated',
      title: 'x',
      body: 'y',
      createdAt: '2026-07-30T06:00:00Z',
    }
    useNotificationsStore.getState().push(item)
    useNotificationsStore.getState().push(item)
    expect(useNotificationsStore.getState().items).toHaveLength(1)
  })
})
