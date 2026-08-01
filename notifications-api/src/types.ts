/** Normalized event pushed to WebSocket subscribers. */
export interface BoardRealtimeEvent {
  id: string
  source: 'azure-service-hook'
  eventType: string
  createdAt: string
  subscriptionId?: string
  notificationId?: number | string
  projectId?: string
  collectionId?: string
  workItemId?: number
  workItemTitle?: string
  workItemType?: string
  workItemState?: string
  /** ADO comment id for workitem.commented. */
  commentId?: number
  assignedTo?: string
  assignedToUniqueName?: string
  message?: string
  /** Original Azure DevOps payload (trimmed). */
  resource?: unknown
}

export interface SubscribeMessage {
  type: 'subscribe'
  filters?: {
    projectIds?: string[]
    eventTypes?: string[]
  }
}

export interface ServerHelloMessage {
  type: 'hello'
  clientId: string
  history: BoardRealtimeEvent[]
}

export interface ServerEventMessage {
  type: 'event'
  event: BoardRealtimeEvent
}

export interface ServerErrorMessage {
  type: 'error'
  message: string
}

export type ServerMessage = ServerHelloMessage | ServerEventMessage | ServerErrorMessage
