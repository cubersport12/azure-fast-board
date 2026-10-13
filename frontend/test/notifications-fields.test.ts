import { describe, expect, it } from 'vitest'
import {
  displayedFieldsHash,
  realtimeUpdateIsVisible,
  workItemFingerprint,
} from '../shared/notifications-fields'
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

describe('realtimeUpdateIsVisible', () => {
  it('skips updates that only touched bookkeeping fields', () => {
    const visible = realtimeUpdateIsVisible(
      {
        fields: {
          'System.Rev': { oldValue: 3, newValue: 4 },
          'System.ChangedDate': {
            oldValue: '2026-10-13T10:00:00Z',
            newValue: '2026-10-13T10:00:05Z',
          },
        },
      },
      ['System.Rev', 'System.ChangedDate'],
    )
    expect(visible).toBe(false)
  })

  it('notifies when a displayed field actually changed', () => {
    const visible = realtimeUpdateIsVisible(
      {
        fields: {
          'System.Title': { oldValue: 'Old title', newValue: 'New title' },
          'System.Rev': { oldValue: 3, newValue: 4 },
        },
        revision: {
          fields: { 'System.Id': 101, 'System.Title': 'New title', 'System.State': 'Active' },
        },
      },
      ['System.Title', 'System.Rev'],
    )
    expect(visible).toBe(true)
  })

  it('skips a delta whose oldValue equals newValue', () => {
    const visible = realtimeUpdateIsVisible(
      {
        fields: {
          'System.Title': { oldValue: 'Same', newValue: 'Same' },
        },
      },
      ['System.Title'],
    )
    expect(visible).toBe(false)
  })

  it('notifies on legacy flat payloads without deltas (cannot verify)', () => {
    const visible = realtimeUpdateIsVisible({
      fields: {
        'System.Title': 'Broken build',
        'System.State': 'Active',
      },
    })
    expect(visible).toBeNull()
  })

  it('notifies when neither resource nor changedFields are available', () => {
    expect(realtimeUpdateIsVisible(undefined)).toBeNull()
    expect(realtimeUpdateIsVisible(undefined, [])).toBeNull()
  })

  it('skips when changedFields prove no displayed overlap even without resource', () => {
    expect(realtimeUpdateIsVisible(undefined, ['System.Rev'])).toBe(false)
  })

  it('ignores the iteration self-move bookkeeping field for the same value', () => {
    const visible = realtimeUpdateIsVisible(
      {
        fields: {
          'System.IterationPath': { oldValue: 'Proj\\Sprint 1', newValue: 'Proj\\Sprint 1' },
        },
      },
      ['System.IterationPath'],
    )
    expect(visible).toBe(false)
  })
})

describe('displayedFieldsHash', () => {
  it('treats equivalent HTML bodies as equal', () => {
    const a = displayedFieldsHash({
      'System.Description': '<p>Hello   world</p>\n<p>Second</p>',
    })
    const b = displayedFieldsHash({ 'System.Description': '<p>Hello world</p> <p>Second</p>' })
    expect(a).toBe(b)
  })

  it('treats different HTML bodies as different', () => {
    const a = displayedFieldsHash({ 'System.Description': '<p>One</p>' })
    const b = displayedFieldsHash({ 'System.Description': '<p>Two</p>' })
    expect(a).not.toBe(b)
  })

  it('is insensitive to tag order and formatting', () => {
    expect(
      displayedFieldsHash({ 'System.Tags': 'ui; backend' }),
    ).toBe(displayedFieldsHash({ 'System.Tags': ['Backend', 'UI'] }))
  })
})

describe('workItemFingerprint', () => {
  it('ignores rev/changedDate-only changes', () => {
    const before = item({ id: 1, title: 'Bug', changedDate: '2026-10-13T10:00:00Z' })
    const after = item({ id: 1, title: 'Bug', rev: 2, changedDate: '2026-10-13T10:00:30Z' })
    expect(workItemFingerprint(before)).toBe(workItemFingerprint(after))
  })

  it('reacts to description changes even when title/state stay put', () => {
    const before = item({ id: 1, title: 'Bug', description: '<p>before</p>' })
    const after = item({ id: 1, title: 'Bug', rev: 2, description: '<p>after</p>' })
    expect(workItemFingerprint(before)).not.toBe(workItemFingerprint(after))
  })

  it('reacts to assignee changes', () => {
    const before = item({ id: 1, title: 'Bug', assignedToUniqueName: 'a@corp' })
    const after = item({ id: 1, title: 'Bug', assignedToUniqueName: 'b@corp' })
    expect(workItemFingerprint(before)).not.toBe(workItemFingerprint(after))
  })
})
