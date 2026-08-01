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
  message?: { text?: string; markdown?: string; html?: string }
  detailedMessage?: { text?: string; markdown?: string; html?: string }
  resource?: {
    id?: number
    workItemId?: number
    workItem?: { id?: number; fields?: Record<string, unknown>; url?: string }
    url?: string
    rev?: number
    fields?: Record<string, unknown>
    revision?: { fields?: Record<string, unknown>; id?: number }
  }
  resourceContainers?: {
    project?: { id?: string }
    collection?: { id?: string }
    account?: { id?: string }
  }
}

function identityName(value: unknown) {
  if (!value) return undefined
  if (typeof value === 'string') {
    const before = value.split('<')[0]?.trim()
    return before || value.trim()
  }
  const identity = value as IdentityRef
  return identity.displayName || identity.uniqueName
}

function identityUnique(value: unknown) {
  if (!value) return undefined
  if (typeof value === 'string') {
    const angle = value.match(/<([^>]+)>/)
    return angle?.[1]?.trim() || undefined
  }
  return (value as IdentityRef).uniqueName
}

function asPositiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
}

function extractWorkItemIdFromText(text?: string) {
  if (!text) return undefined
  const patterns = [
    /workitems\/edit\/(\d+)/i,
    /workItems\/(\d+)/i,
    /\/edit\/(\d+)/i,
    /[?&]id=(\d+)/i,
    /\b(?:Bug|Task|User Story|Feature|PBI|Issue)\s+#?(\d{2,})\b/i,
    /#(\d{2,})\b/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return asPositiveInt(match[1])
  }
  return undefined
}

/** Map Azure DevOps Service Hook POST body → realtime event. */
export function mapServiceHookPayload(raw: unknown): BoardRealtimeEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const payload = raw as AzureHookPayload
  if (!payload.eventType?.trim()) return null

  const isCommented = /^workitem\.commented$/i.test(payload.eventType || '')
  const fields =
    payload.resource?.fields ||
    payload.resource?.revision?.fields ||
    payload.resource?.workItem?.fields ||
    {}

  const messageText =
    payload.detailedMessage?.markdown ||
    payload.detailedMessage?.text ||
    payload.detailedMessage?.html ||
    payload.message?.markdown ||
    payload.message?.text ||
    payload.message?.html

  const resourceId = asPositiveInt(payload.resource?.id)
  let workItemId =
    asPositiveInt(payload.resource?.workItemId) ||
    asPositiveInt(payload.resource?.workItem?.id) ||
    asPositiveInt(fields['System.Id']) ||
    asPositiveInt(payload.resource?.revision?.id) ||
    extractWorkItemIdFromText(payload.resource?.url) ||
    extractWorkItemIdFromText(payload.resource?.workItem?.url) ||
    extractWorkItemIdFromText(messageText)

  let commentId: number | undefined

  if (isCommented) {
    if (workItemId && resourceId && resourceId !== workItemId) {
      // Normal ADO shape: resource.id = comment, workItemId = work item.
      commentId = resourceId
    } else if (!workItemId && resourceId) {
      // Some on-prem payloads only put the work item id into resource.id.
      workItemId = resourceId
      commentId = undefined
    }
  } else if (!workItemId && resourceId) {
    workItemId = resourceId
  }

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
    commentId,
    assignedTo: identityName(fields['System.AssignedTo']),
    assignedToUniqueName: identityUnique(fields['System.AssignedTo']),
    message: messageText,
    resource: payload.resource,
  }
}
