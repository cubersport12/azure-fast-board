import { randomUUID } from 'node:crypto'
import type { BoardRealtimeEvent } from './types.js'

interface IdentityRef {
  displayName?: string
  uniqueName?: string
}

interface AzureHookPayload {
  id?: string
  subscriptionId?: string
  notificationId?: number | string
  eventType?: string
  createdDate?: string
  message?: { text?: string; markdown?: string }
  detailedMessage?: { text?: string; markdown?: string }
  resource?: {
    id?: number
    rev?: number
    fields?: Record<string, unknown>
    revision?: { fields?: Record<string, unknown> }
  }
  resourceContainers?: {
    project?: { id?: string }
    collection?: { id?: string }
    account?: { id?: string }
  }
}

function identityName(value: unknown) {
  if (!value) return undefined
  if (typeof value === 'string') return value
  const identity = value as IdentityRef
  return identity.displayName || identity.uniqueName
}

function identityUnique(value: unknown) {
  if (!value || typeof value === 'string') return undefined
  return (value as IdentityRef).uniqueName
}

/** Map Azure DevOps Service Hook POST body → realtime event. */
export function mapServiceHookPayload(raw: unknown): BoardRealtimeEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const payload = raw as AzureHookPayload
  if (!payload.eventType?.trim()) return null

  const fields =
    payload.resource?.fields ||
    payload.resource?.revision?.fields ||
    {}

  const workItemId =
    typeof payload.resource?.id === 'number'
      ? payload.resource.id
      : typeof fields['System.Id'] === 'number'
        ? (fields['System.Id'] as number)
        : undefined

  const title =
    fields['System.Title'] != null
      ? String(fields['System.Title'])
      : payload.message?.text?.trim() || undefined

  return {
    id: String(payload.id || randomUUID()),
    source: 'azure-service-hook',
    eventType: payload.eventType.trim(),
    createdAt: payload.createdDate || new Date().toISOString(),
    subscriptionId: payload.subscriptionId,
    notificationId: payload.notificationId,
    projectId: payload.resourceContainers?.project?.id,
    collectionId:
      payload.resourceContainers?.collection?.id ||
      payload.resourceContainers?.account?.id,
    workItemId,
    workItemTitle: title,
    workItemType: fields['System.WorkItemType']
      ? String(fields['System.WorkItemType'])
      : undefined,
    workItemState: fields['System.State'] ? String(fields['System.State']) : undefined,
    assignedTo: identityName(fields['System.AssignedTo']),
    assignedToUniqueName: identityUnique(fields['System.AssignedTo']),
    message:
      payload.detailedMessage?.markdown ||
      payload.detailedMessage?.text ||
      payload.message?.markdown ||
      payload.message?.text,
    resource: payload.resource,
  }
}
