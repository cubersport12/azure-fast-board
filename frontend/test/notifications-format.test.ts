import { describe, expect, it } from 'vitest'
import {
  formatWindowsNotification,
  hasUnreadNotification,
  healNotificationIds,
  notificationOpenRoute,
} from '../shared/notifications-format'
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
    expect(formatted.title).toContain('Комментарий:')
    expect(formatted.title).toContain('баг')
    expect(formatted.title).toContain('#25201')
    expect(formatted.body).toContain('Тестовый баг')
    expect(formatted.body).toContain('Hello world')
  })

  it('does not duplicate work item title in body', () => {
    const formatted = formatWindowsNotification(
      note({
        eventType: 'workitem.commented',
        workItemId: 1,
        workItemTitle: 'Тестовый баг',
        body: 'Тестовый баг\nТекст комментария',
      }),
    )
    expect(formatted.body).toBe('Тестовый баг\nТекст комментария')
    expect(formatted.body.split('Тестовый баг').length - 1).toBe(1)
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

  it('heals mis-mapped comment id into workItemId', () => {
    const healed = healNotificationIds(
      note({
        eventType: 'workitem.commented',
        commentId: 25201,
        body: '[Bug 25201](https://tfs/edit/25201) comment',
      }),
    )
    expect(healed.workItemId).toBe(25201)
    expect(healed.commentId).toBeUndefined()
    expect(notificationOpenRoute(healed)).toBe('/work-items/25201')
  })

  it('names create vs update and work item type', () => {
    expect(
      formatWindowsNotification(
        note({
          eventType: 'workitem.created',
          workItemId: 10,
          workItemType: 'Bug',
          workItemTitle: 'Падает логин',
        }),
      ).title,
    ).toBe('Создан: баг #10')
    expect(
      formatWindowsNotification(
        note({
          eventType: 'workitem.updated',
          workItemId: 11,
          workItemType: 'Task',
          workItemTitle: 'Починить логин',
        }),
      ).title,
    ).toBe('Изменён: таск #11')
  })

  it('strips markdown links from toast body', () => {
    const formatted = formatWindowsNotification(
      note({
        eventType: 'workitem.commented',
        workItemId: 25201,
        workItemTitle: 'Тестовый баг',
        body: '[Comment](https://tfs/_apis/wit/workItems/25201/comments/7)',
      }),
    )
    expect(formatted.body).not.toMatch(/https?:\/\//)
    expect(formatted.body).toContain('Тестовый баг')
  })
})

describe('hasUnreadNotification', () => {
  it('matches unread duplicates across WS and poll naming', () => {
    const history = [
      note({ id: 'a', eventType: 'workitem.updated', workItemId: 10, read: false }),
    ]
    expect(hasUnreadNotification(history, 'workitem.assigned', 10)).toBe(true)
    expect(hasUnreadNotification(history, 'workitem.updated', 10)).toBe(true)
  })

  it('ignores read history and other items or event families', () => {
    const history = [
      note({ id: 'a', eventType: 'workitem.updated', workItemId: 10, read: true }),
      note({ id: 'b', eventType: 'workitem.commented', workItemId: 10, read: false }),
      note({ id: 'c', eventType: 'workitem.updated', workItemId: 11, read: false }),
    ]
    expect(hasUnreadNotification(history, 'workitem.updated', 10)).toBe(false)
    expect(hasUnreadNotification(history, 'workitem.commented', 10)).toBe(true)
    expect(hasUnreadNotification(history, 'workitem.updated', 11)).toBe(true)
  })

  it('requires a work item id', () => {
    expect(hasUnreadNotification([note({ id: 'a' })], 'workitem.updated', undefined)).toBe(false)
  })
})
