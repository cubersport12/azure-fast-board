import { describe, expect, it } from 'vitest'
import type { WorkItem } from '../shared/types'
import { DEFAULT_FILTERS, applyWorkItemFilters } from '../src/lib/work-item-filters'

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
