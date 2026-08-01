import { describe, expect, it } from 'vitest'
import {
  formatWindowsNotification,
  notificationOpenRoute,
} from '../electron/main/notifications/format'
import type { BoardNotification } from '../shared/types'

function note(partial: Partial<BoardNotification>): BoardNotification {
  return {
    id: '1',
    eventType: 'workitem.updated',
    title: 't',
    body: 'b',
    createdAt: new Date().toISOString(),
    ...partial,
  }
}

describe('formatWindowsNotification', () => {
  it('formats commented toast', () => {
    const formatted = formatWindowsNotification(
      note({
        eventType: 'workitem.commented',
        workItemId: 25201,
        workItemTitle: 'Тестовый баг',
        body: '**Hello** world',
        commentId: 9,
      }),
    )
    expect(formatted.title).toContain('Комментарий')
    expect(formatted.title).toContain('#25201')
    expect(formatted.body).toContain('Тестовый баг')
    expect(formatted.body).toContain('Hello world')
  })

  it('builds open routes', () => {
    expect(
      notificationOpenRoute(
        note({ eventType: 'workitem.deleted', workItemId: 1 }),
      ),
    ).toBeNull()
    expect(
      notificationOpenRoute(
        note({ eventType: 'workitem.created', workItemId: 2 }),
      ),
    ).toBe('/work-items/2')
    expect(
      notificationOpenRoute(
        note({ eventType: 'workitem.commented', workItemId: 3, commentId: 11 }),
      ),
    ).toBe('/work-items/3?commentId=11')
  })
})
