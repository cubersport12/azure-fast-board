import { describe, expect, it } from 'vitest'
import type { WorkItem } from '../shared/types'
import {
  DEFAULT_FILTERS,
  EMPTY_FILTERS,
  ME_ASSIGNEE,
  applyWorkItemFilters,
  filtersForPreset,
  isCompletedState,
  matchFilterPreset,
} from '../src/lib/work-item-filters'

function item(partial: Partial<WorkItem> & Pick<WorkItem, 'id' | 'title'>): WorkItem {
  return {
    rev: 1,
    type: 'Bug',
    state: 'New',
    tags: [],
    ...partial,
  }
}

describe('applyWorkItemFilters iteration', () => {
  const items = [
    item({ id: 1, title: 'A', iterationPath: 'Proj\\Sprint 1', state: 'New', type: 'Bug' }),
    item({ id: 2, title: 'B', iterationPath: 'Proj\\Sprint 2', state: 'New', type: 'Bug' }),
    item({ id: 3, title: 'C', iterationPath: 'Proj\\Sprint 1\\Child', state: 'New', type: 'Bug' }),
    item({ id: 4, title: 'D', state: 'New', type: 'Bug' }),
  ]

  const filters = { ...DEFAULT_FILTERS, assignees: [] }

  it('shows all when iteration is not selected', () => {
    const result = applyWorkItemFilters(items, '', filters, null, '')
    expect(result.map((entry) => entry.id)).toEqual([1, 2, 3, 4])
  })

  it('filters by selected iteration including children', () => {
    const result = applyWorkItemFilters(items, '', filters, null, 'Proj\\Sprint 1')
    expect(result.map((entry) => entry.id)).toEqual([1, 3])
  })
})

describe('Me assignee/creator identity', () => {
  const base = { ...EMPTY_FILTERS, types: [], states: [] }

  it('matches FIO via displayName when login alone would miss', () => {
    const items = [
      item({
        id: 1,
        title: 'Mine',
        assignedTo: 'Иванов Иван',
        createdBy: 'Иванов Иван',
      }),
      item({
        id: 2,
        title: 'Other',
        assignedTo: 'Петров Пётр',
        createdBy: 'Петров Пётр',
      }),
    ]
    const me = {
      username: 'CORP\\ivanovaa',
      displayName: 'Иванов Иван',
      uniqueName: 'ivanovaa@corp.local',
    }

    expect(
      applyWorkItemFilters(items, '', { ...base, assignees: [ME_ASSIGNEE] }, 'CORP\\ivanovaa').map(
        (entry) => entry.id,
      ),
    ).toEqual([])

    expect(
      applyWorkItemFilters(items, '', { ...base, assignees: [ME_ASSIGNEE] }, me).map((entry) => entry.id),
    ).toEqual([1])

    expect(
      applyWorkItemFilters(items, '', { ...base, creators: [ME_ASSIGNEE] }, me).map((entry) => entry.id),
    ).toEqual([1])
  })

  it('matches via uniqueName on the work item', () => {
    const items = [
      item({
        id: 1,
        title: 'Mine',
        assignedTo: 'Иванов Иван',
        assignedToUniqueName: 'CORP\\ivanovaa',
        createdBy: 'Иванов Иван',
        createdByUniqueName: 'CORP\\ivanovaa',
      }),
    ]
    expect(
      applyWorkItemFilters(items, '', { ...base, assignees: [ME_ASSIGNEE] }, 'CORP\\ivanovaa').map(
        (entry) => entry.id,
      ),
    ).toEqual([1])
  })
})

describe('filter presets', () => {
  const availableStates = ['New', 'Active', 'Closed', 'Done']
  const items = [
    item({ id: 1, title: 'Mine open', state: 'New', createdBy: 'Alex', type: 'Bug' }),
    item({ id: 2, title: 'Mine done', state: 'Closed', createdBy: 'Alex', type: 'Bug' }),
    item({ id: 3, title: 'Other open', state: 'Active', createdBy: 'Sam', type: 'Task' }),
    item({ id: 4, title: 'Other done', state: 'Done', createdBy: 'Sam', type: 'Task' }),
  ]

  it('detects completed states', () => {
    expect(isCompletedState('Closed')).toBe(true)
    expect(isCompletedState('Done')).toBe(true)
    expect(isCompletedState('New')).toBe(false)
  })

  it('created-by-me sets creators filter', () => {
    const filters = filtersForPreset('created-by-me', availableStates)
    expect(filters.creators).toEqual(['Me'])
    expect(applyWorkItemFilters(items, '', filters, 'alex@corp.local').map((entry) => entry.id)).toEqual([
      1, 2,
    ])
    expect(matchFilterPreset(filters, availableStates)).toBe('created-by-me')
  })

  it('done/open set states lists and Author=Me', () => {
    const done = filtersForPreset('done', availableStates)
    const open = filtersForPreset('open', availableStates)
    expect(done.creators).toEqual([ME_ASSIGNEE])
    expect(open.creators).toEqual([ME_ASSIGNEE])
    expect(done.states).toEqual(expect.arrayContaining(['Closed', 'Done']))
    expect(open.states).toEqual(expect.arrayContaining(['New', 'Active']))
    expect(applyWorkItemFilters(items, '', done, 'Alex').map((entry) => entry.id)).toEqual([2])
    expect(applyWorkItemFilters(items, '', open, 'Alex').map((entry) => entry.id)).toEqual([1])
  })
})
