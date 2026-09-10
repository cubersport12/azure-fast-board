import { describe, expect, it } from 'vitest'
import {
  AzureClient,
  azureBasicAuthHeader,
  createDemoWorkItems,
  defaultWorkItemsWiql,
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

describe('defaultWorkItemsWiql', () => {
  it('scopes to the selected iteration when set', () => {
    expect(defaultWorkItemsWiql('Project\\Sprint 1')).toContain(
      "[System.IterationPath] UNDER 'Project\\Sprint 1'",
    )
    expect(defaultWorkItemsWiql("O'Brien")).toContain("UNDER 'O''Brien'")
    expect(defaultWorkItemsWiql('')).not.toContain('IterationPath')
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
        'System.Description': '<p>Desc</p>',
        'Microsoft.VSTS.TCM.ReproSteps': '<div>Тут описание</div><img src="https://x/a.png" />',
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
      description: '<p>Desc</p>',
      reproSteps: '<div>Тут описание</div><img src="https://x/a.png" />',
    })
  })
})

describe('createDemoWorkItems', () => {
  it('returns seed cards for offline mode', () => {
    expect(createDemoWorkItems().length).toBeGreaterThan(0)
  })
})

describe('uploadAttachment', () => {
  it('returns the authoritative uploaded url, not the last relation', async () => {
    const client = new AzureClient({
      connection: {
        serverUrl: 'https://tfs.local',
        collection: 'Col',
        project: 'Proj',
        team: '',
        apiVersion: '5.0',
      },
      password: 'secret',
      username: 'DOMAIN\\user',
    })

    const uploadUrl = 'https://tfs.local/Col/_apis/wit/attachments/11111111-1111-1111-1111-111111111111?fileName=second.png'
    const responses: unknown[] = [
      { url: uploadUrl }, // POST upload
      { id: 7, rev: 12, relations: [] }, // GET current (If-Match)
      { id: 7, rev: 13, relations: [] }, // PATCH link
    ]
    ;(client as unknown as { request: (url: string, init?: RequestInit) => Promise<unknown> })
      .request = async () => responses.shift()

    const uploaded = await client.uploadAttachment(7, {
      fileName: 'second.png',
      mimeType: 'image/png',
      dataBase64: Buffer.from('second-image').toString('base64'),
    })

    expect(uploaded).toEqual({ url: uploadUrl, name: 'second.png', rev: 13 })
    expect(responses).toHaveLength(0)
  })
})
