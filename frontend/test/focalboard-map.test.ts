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

  it('takes the group from the board view, not the first view grouped by priority', () => {
    const result = mapFocalboardCards(
      [
        { id: 'board1', type: 'board', title: 'ТЕСТ', fields: { cardProperties: properties } },
        // Первая в списке — таблица, сгруппированная по приоритету.
        { id: 'view0', parentId: 'board1', type: 'view', fields: { type: 'table', groupById: 'prio' } },
        { id: 'view1', parentId: 'board1', type: 'view', fields: { type: 'board', groupById: 'status' } },
        {
          id: 'card1',
          parentId: 'board1',
          type: 'card',
          title: 'Задача',
          fields: { properties: { status: 's2', prio: 'p2' } },
        },
      ],
    )
    expect(result.statuses).toContain('В работе')
    expect(result.statuses).not.toContain('2. MEDIUM')
    expect(result.cards[0].status).toBe('В работе')
    expect(result.priorities).toContain('2. MEDIUM')
    expect(result.viewId).toBe('view1')
  })

  it('resolves the cyrillic «Статус» property by name when grouping is lost', () => {
    const cyrillicProperties = [
      { id: 'prio', name: 'Приоритет', type: 'select', options: [{ id: 'p1', value: '1. HIGH' }] },
      {
        id: 'st',
        name: 'Статус',
        type: 'select',
        options: [{ id: 's9', value: 'Выложено' }],
      },
    ]
    const result = mapFocalboardCards(
      [
        { id: 'board1', type: 'board', title: 'ТЕСТ', fields: { cardProperties: cyrillicProperties } },
        { id: 'card1', parentId: 'board1', type: 'card', title: 'Без вида', fields: { properties: { st: 's9', prio: 'p1' } } },
      ],
    )
    expect(result.statuses).toEqual(['Выложено'])
    expect(result.cards[0].status).toBe('Выложено')
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
