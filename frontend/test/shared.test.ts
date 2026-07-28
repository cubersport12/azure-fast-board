import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from '../shared/ipc'
import { DEFAULT_SETTINGS } from '../shared/types'

describe('shared contracts', () => {
  it('exposes required ipc channels', () => {
    expect(IPC_CHANNELS.workItemsCreate).toBe('workItems:create')
    expect(IPC_CHANNELS.eventShowQuickCreate).toBe('event:showQuickCreate')
  })

  it('has speed-first defaults', () => {
    expect(DEFAULT_SETTINGS.launchMinimized).toBe(true)
    expect(DEFAULT_SETTINGS.hideToTrayOnClose).toBe(true)
    expect(DEFAULT_SETTINGS.globalHotkey).toContain('Shift+Space')
  })
})
