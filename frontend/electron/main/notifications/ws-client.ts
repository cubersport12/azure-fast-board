import { loadNotificationsApiToken } from '../credentials'

export interface RealtimeBoardEvent {
  id: string
  source: string
  eventType: string
  createdAt: string
  projectId?: string
  workItemId?: number
  workItemTitle?: string
  workItemType?: string
  workItemState?: string
  assignedTo?: string
  assignedToUniqueName?: string
  message?: string
}

type EventHandler = (event: RealtimeBoardEvent) => void
type StatusHandler = (status: { connected: boolean; message?: string }) => void

export function toWsUrl(apiBase: string, token: string, projectId?: string) {
  const base = apiBase.trim().replace(/\/$/, '')
  const url = new URL(base.startsWith('http') ? base : `http://${base}`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws'
  url.search = ''
  if (token) url.searchParams.set('token', token)
  if (projectId) url.searchParams.set('projectId', projectId)
  return url.toString()
}

function redactWsUrl(wsUrl: string) {
  try {
    const url = new URL(wsUrl)
    if (url.searchParams.has('token')) url.searchParams.set('token', '***')
    return url.toString()
  } catch {
    return wsUrl
  }
}

/**
 * WebSocket client for notifications-api.
 * Reconnects with exponential backoff while enabled.
 */
export class NotificationsWsClient {
  private socket: WebSocket | null = null
  private stopped = true
  private reconnectTimer: NodeJS.Timeout | null = null
  private attempt = 0
  private apiUrl = ''
  private projectId?: string
  private onEvent: EventHandler | null = null
  private onStatus: StatusHandler | null = null

  configure(options: {
    apiUrl: string
    projectId?: string
    onEvent: EventHandler
    onStatus?: StatusHandler
  }) {
    this.apiUrl = options.apiUrl.trim()
    this.projectId = options.projectId
    this.onEvent = options.onEvent
    this.onStatus = options.onStatus ?? null
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN
  }

  start() {
    this.stopped = false
    this.connect()
  }

  stop() {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close()
    this.socket = null
    this.onStatus?.({ connected: false, message: 'stopped' })
  }

  private connect() {
    if (this.stopped) return
    if (!this.apiUrl) {
      this.onStatus?.({ connected: false, message: 'apiUrl is empty' })
      return
    }

    const token = loadNotificationsApiToken() || ''
    let wsUrl: string
    try {
      wsUrl = toWsUrl(this.apiUrl, token, this.projectId)
    } catch (error) {
      this.onStatus?.({
        connected: false,
        message: error instanceof Error ? error.message : 'Invalid apiUrl',
      })
      return
    }

    try {
      this.socket?.close()
      console.log(`[notifications] ws connecting ${redactWsUrl(wsUrl)}`)
      this.socket = new WebSocket(wsUrl)
    } catch (error) {
      this.onStatus?.({
        connected: false,
        message: error instanceof Error ? error.message : 'WebSocket open failed',
      })
      this.scheduleReconnect()
      return
    }

    this.socket.addEventListener('open', () => {
      this.attempt = 0
      this.onStatus?.({ connected: true, message: 'connected' })
      const subscribe = {
        type: 'subscribe',
        filters: {
          projectIds: this.projectId ? [this.projectId] : [],
          eventTypes: [
            'workitem.created',
            'workitem.updated',
            'workitem.commented',
            'workitem.deleted',
            'workitem.restored',
          ],
        },
      }
      this.socket?.send(JSON.stringify(subscribe))
      console.log(
        `[notifications] ws subscribed` +
          ` projectId=${this.projectId || '*'}` +
          ` eventTypes=${subscribe.filters.eventTypes.join(',')}`,
      )
    })

    this.socket.addEventListener('message', (message) => {
      try {
        const data = JSON.parse(String(message.data)) as {
          type?: string
          clientId?: string
          history?: RealtimeBoardEvent[]
          event?: RealtimeBoardEvent
          message?: string
        }
        if (data.type === 'hello') {
          console.log(
            `[notifications] ws hello clientId=${data.clientId || '?'}` +
              ` history=${data.history?.length ?? 0}`,
          )
          return
        }
        if (data.type === 'error') {
          console.warn(`[notifications] ws error: ${data.message || 'unknown'}`)
          return
        }
        if (data.type === 'event' && data.event) {
          console.log(
            `[notifications] ws event` +
              ` type=${data.event.eventType}` +
              ` workItemId=${data.event.workItemId ?? '-'}`,
          )
          this.onEvent?.(data.event)
        }
      } catch {
        // ignore malformed frames
      }
    })

    this.socket.addEventListener('close', () => {
      this.onStatus?.({ connected: false, message: 'disconnected' })
      console.log('[notifications] ws disconnected')
      this.scheduleReconnect()
    })

    this.socket.addEventListener('error', () => {
      this.onStatus?.({ connected: false, message: 'socket error' })
      console.warn('[notifications] ws socket error')
    })
  }

  private scheduleReconnect() {
    if (this.stopped || !this.apiUrl) return
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.attempt, 5))
    this.attempt += 1
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }
}
