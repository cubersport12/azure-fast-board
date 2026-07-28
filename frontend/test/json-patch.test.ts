import { describe, expect, it } from 'vitest'

function buildPatchOps(fields: Record<string, string | number | boolean | null | undefined>) {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({
      op: 'add',
      path: `/fields/${key}`,
      value,
    }))
}

describe('json patch ops', () => {
  it('skips undefined and keeps null clears', () => {
    expect(
      buildPatchOps({
        'System.Title': 'Hello',
        'System.AssignedTo': null,
        'System.Tags': undefined,
      }),
    ).toEqual([
      { op: 'add', path: '/fields/System.Title', value: 'Hello' },
      { op: 'add', path: '/fields/System.AssignedTo', value: null },
    ])
  })
})
