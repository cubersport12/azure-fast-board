import { describe, expect, it } from 'vitest'
import {
  azureBasicAuthHeader,
  createDemoWorkItems,
  mapWorkItem,
  normalizePatSecret,
} from '../electron/main/azure/client'
import { parseTags, workItemColor } from '../shared/utils'

describe('parseTags', () => {
  it('splits azure tag strings', () => {
    expect(parseTags('bug; vpn; ux')).toEqual(['bug', 'vpn', 'ux'])
  })
})

describe('PAT normalization', () => {
  it('keeps raw PAT as-is', () => {
    expect(normalizePatSecret('abcdefghijklmnopqrstuvwxyz12')).toBe(
      'abcdefghijklmnopqrstuvwxyz12',
    )
  })

  it('unwraps npmrc _password base64(rawPat)', () => {
    const raw = 'abcdefghijklmnopqrstuvwxyz12'
    const encoded = Buffer.from(raw).toString('base64')
    expect(normalizePatSecret(encoded)).toBe(raw)
  })

  it('unwraps base64("user:PAT") once', () => {
    const encoded = Buffer.from('DefaultCollection:my-secret-pat-token-value').toString('base64')
    expect(normalizePatSecret(encoded)).toBe('my-secret-pat-token-value')
  })

  it('builds Basic header like npm (non-empty user + PAT)', () => {
    const header = azureBasicAuthHeader('my-pat-token', 'pat', 'DefaultCollection')
    expect(header).toBe(
      `Basic ${Buffer.from('DefaultCollection:my-pat-token').toString('base64')}`,
    )
  })

  it('defaults PAT username to VssSessionToken', () => {
    const header = azureBasicAuthHeader('my-pat-token', 'pat', '')
    expect(header).toBe(`Basic ${Buffer.from('VssSessionToken:my-pat-token').toString('base64')}`)
  })
})

describe('workItemColor', () => {
  it('maps known types', () => {
    expect(workItemColor('Bug')).toContain('rose')
    expect(workItemColor('Task')).toContain('amber')
  })
})

describe('service hook mapping helpers', () => {
  it('exposes create payload shape for webHooks consumer', () => {
    const body = {
      publisherId: 'tfs',
      eventType: 'workitem.updated',
      resourceVersion: '1.0',
      consumerId: 'webHooks',
      consumerActionId: 'httpRequest',
      publisherInputs: { projectId: 'proj-guid' },
      consumerInputs: { url: 'https://mattermost.example/hooks/xxx' },
    }
    expect(body.consumerId).toBe('webHooks')
    expect(body.eventType).toBe('workitem.updated')
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
