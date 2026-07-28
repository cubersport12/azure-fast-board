import { describe, expect, it } from 'vitest'
import { mapWorkItem, createDemoWorkItems } from '../electron/main/azure/client'
import { parseTags, workItemColor } from '../shared/utils'

describe('parseTags', () => {
  it('splits azure tag strings', () => {
    expect(parseTags('bug; vpn; ux')).toEqual(['bug', 'vpn', 'ux'])
  })
})

describe('workItemColor', () => {
  it('maps known types', () => {
    expect(workItemColor('Bug')).toContain('rose')
    expect(workItemColor('Task')).toContain('amber')
  })
})

describe('mapWorkItem', () => {
  it('maps azure fields into ui model', () => {
    const item = mapWorkItem({
      id: 42,
      rev: 3,
      url: 'https://example/local/_workitems/edit/42',
      fields: {
        'System.Title': 'Broken build',
        'System.WorkItemType': 'Bug',
        'System.State': 'Active',
        'System.BoardColumn': 'Active',
        'System.AssignedTo': { displayName: 'Alex', uniqueName: 'alex@corp.local' },
        'System.CreatedBy': { displayName: 'Sam Author', uniqueName: 'sam@corp.local' },
        'System.Tags': 'ci; build',
      },
    })

    expect(item).toMatchObject({
      id: 42,
      rev: 3,
      title: 'Broken build',
      type: 'Bug',
      state: 'Active',
      boardColumn: 'Active',
      assignedTo: 'Alex',
      createdBy: 'Sam Author',
      tags: ['ci', 'build'],
    })
  })
})

describe('createDemoWorkItems', () => {
  it('returns seed cards for offline mode', () => {
    expect(createDemoWorkItems().length).toBeGreaterThan(0)
  })
})
