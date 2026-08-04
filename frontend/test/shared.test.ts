import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from '../shared/ipc'
import { DEFAULT_SETTINGS } from '../shared/types'
import { normalizeAreaFieldPath, normalizeIterationFieldPath } from '../shared/utils'

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
    expect(DEFAULT_SETTINGS.filterPresets).toEqual([])
    expect(DEFAULT_SETTINGS.selectFavorites).toEqual({})
    expect(DEFAULT_SETTINGS.notifications.enabled).toBe(true)
    expect(DEFAULT_SETTINGS.notifications.apiUrl).toBe('http://172.22.91.47:8787')
    expect(DEFAULT_SETTINGS.notifications.providers.app.flashTaskbar).toBe(true)
    expect(IPC_CHANNELS.serviceHooksList).toBe('serviceHooks:list')
    expect(IPC_CHANNELS.eventNotification).toBe('event:notification')
  })

  it('strips structural Iteration node from field paths', () => {
    expect(normalizeIterationFieldPath('\\Proj\\Iteration\\Sprint 1', 'Proj')).toBe(
      'Proj\\Sprint 1',
    )
    expect(normalizeIterationFieldPath('Proj\\Iteration\\Rel\\S1', 'Proj')).toBe('Proj\\Rel\\S1')
    expect(normalizeIterationFieldPath('Proj\\Sprint 1', 'Proj')).toBe('Proj\\Sprint 1')
  })

  it('strips structural Area node from field paths', () => {
    expect(normalizeAreaFieldPath('\\Proj\\Area\\Team A', 'Proj')).toBe('Proj\\Team A')
    expect(normalizeAreaFieldPath('Proj\\Area', 'Proj')).toBe('Proj')
    expect(normalizeAreaFieldPath('Proj\\Team A', 'Proj')).toBe('Proj\\Team A')
  })
})
