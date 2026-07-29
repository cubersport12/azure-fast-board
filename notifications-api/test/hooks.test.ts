import { describe, expect, it } from 'vitest'
import { mapServiceHookPayload } from '../src/hooks.js'

describe('mapServiceHookPayload', () => {
  it('maps workitem.updated hook body', () => {
    const event = mapServiceHookPayload({
      id: 'evt-1',
      subscriptionId: 'sub-1',
      notificationId: 42,
      eventType: 'workitem.updated',
      createdDate: '2026-07-29T12:00:00Z',
      message: { text: 'Bug 101 updated' },
      resource: {
        id: 101,
        fields: {
          'System.Title': 'Broken build',
          'System.WorkItemType': 'Bug',
          'System.State': 'Active',
          'System.AssignedTo': { displayName: 'Alex', uniqueName: 'alex@corp.local' },
        },
      },
      resourceContainers: {
        project: { id: 'proj-guid' },
        collection: { id: 'col-guid' },
      },
    })

    expect(event).toMatchObject({
      id: 'evt-1',
      source: 'azure-service-hook',
      eventType: 'workitem.updated',
      workItemId: 101,
      workItemTitle: 'Broken build',
      workItemType: 'Bug',
      workItemState: 'Active',
      assignedTo: 'Alex',
      assignedToUniqueName: 'alex@corp.local',
      projectId: 'proj-guid',
      collectionId: 'col-guid',
    })
  })

  it('returns null without eventType', () => {
    expect(mapServiceHookPayload({ resource: { id: 1 } })).toBeNull()
  })
})
