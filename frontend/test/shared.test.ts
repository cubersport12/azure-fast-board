import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from '../shared/ipc'
import { DEFAULT_SETTINGS } from '../shared/types'
import { normalizeIterationFieldPath } from '../shared/utils'

describe('shared contracts', () => {
  it('exposes required ipc channels', () => {
    expect(IPC_CHANNELS.workItemsCreate).toBe('workItems:create')
    expect(IPC_CHANNELS.eventShowQuickCreate).toBe('event:showQuickCreate')
    expect(IPC_CHANNELS.iterationPaths).toBe('meta:iterationPaths')
  })

  it('has speed-first defaults', () => {
    expect(DEFAULT_SETTINGS.launchMinimized).toBe(true)
    expect(DEFAULT_SETTINGS.hideToTrayOnClose).toBe(true)
    expect(DEFAULT_SETTINGS.globalHotkey).toContain('Shift+Space')
    expect(DEFAULT_SETTINGS.subscribedIterations).toEqual([])
    expect(DEFAULT_SETTINGS.selectedIterationPath).toBe('')
    expect(DEFAULT_SETTINGS.lastAssignee).toBe('')
    expect(DEFAULT_SETTINGS.filters).toEqual({
      types: [],
      states: [],
      assignees: [],
      creators: [],
      tags: [],
    })
  })

  it('strips structural Iteration node from field paths', () => {
    expect(normalizeIterationFieldPath('\\Proj\\Iteration\\Sprint 1', 'Proj')).toBe(
      'Proj\\Sprint 1',
    )
    expect(normalizeIterationFieldPath('Proj\\Iteration\\Rel\\S1', 'Proj')).toBe('Proj\\Rel\\S1')
    expect(normalizeIterationFieldPath('Proj\\Sprint 1', 'Proj')).toBe('Proj\\Sprint 1')
  })
})
