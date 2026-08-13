import { describe, expect, it } from 'vitest'
import {
  cardIdFromMmTag,
  inferCardKind,
  mapFocalboardBoards,
  mapFocalboardCards,
  mmCardTag,
  parsePriorityNumber,
  textToHtml,
} from '../electron/main/mattermost/focalboard-map'

const properties = [
  {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: [
      { id: 's1', value: 'Новое' },
      { id: 's2', value: 'В работе' },
    ],
  },
  {
    id: 'prio',
    name: 'Priority',
    type: 'select',
    options: [{ id: 'p2', value: '2. MEDIUM' }],
  },
  {
    id: 'labels',
    name: 'Метки',
    type: 'multiSelect',
    options: [{ id: 'l1', value: 'ЖУРНАЛ СОБЫТИЙ' }],
  },
]

describe('focalboard-map', () => {
  it('filters boards by channel', () => {
    const boards = mapFocalboardBoards(
      [
        { id: 'b1', title: 'Release', channelId: 'ch-a' },
        { id: 'b2', title: 'Other', channelId: 'ch-b' },
      ],
      'ch-a',
    )
    expect(boards.map((board) => board.id)).toEqual(['b1'])
  })

  it('maps cards, status, priority and tags from blocks', () => {
    const result = mapFocalboardCards(
      [
        { id: 'board1', type: 'board', title: 'ТЕСТ', fields: { cardProperties: properties } },
        { id: 'view1', parentId: 'board1', type: 'view', fields: { viewType: 'board', groupById: 'status' } },
        {
          id: 'card1',
          parentId: 'board1',
          type: 'card',
          title: 'Баг градиента',
          fields: { properties: { status: 's1', prio: 'p2', labels: ['l1'] } },
        },
        { id: 'txt1', parentId: 'card1', type: 'text', title: 'Шаги:\nоткрыть' },
      ],
    )
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]).toMatchObject({
      id: 'card1',
      title: 'Баг градиента',
      status: 'Новое',
      priority: '2. MEDIUM',
      tags: ['ЖУРНАЛ СОБЫТИЙ'],
      description: 'Шаги:\nоткрыть',
      kind: 'Bug',
    })
    expect(result.statuses).toContain('Новое')
    expect(result.priorities).toContain('2. MEDIUM')
  })

  it('infers bug vs task from icon', () => {
    expect(inferCardKind({ icon: '❗', title: 'Настройка' })).toBe('Bug')
    expect(inferCardKind({ icon: '⚠️', title: 'Настройка' })).toBe('Task')
  })

  it('parses priority and mm tags', () => {
    expect(parsePriorityNumber('2. MEDIUM')).toBe(2)
    expect(parsePriorityNumber('P1')).toBe(1)
    expect(mmCardTag('abc')).toBe('mm:abc')
    expect(cardIdFromMmTag('mm:abc')).toBe('abc')
    expect(textToHtml('a <b>\n')).toBe('a &lt;b&gt;<br/>')
  })
})
