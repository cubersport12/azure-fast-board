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
  commentId?: number
  assignedTo?: string
  assignedToUniqueName?: string
  message?: string
}

type EventHandler = (event: RealtimeBoardEvent) => void
type HistoryHandler = (events: RealtimeBoardEvent[]) => void
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
  private onHistory: HistoryHandler | null = null
  private onStatus: StatusHandler | null = null
  private lastStatusLog = ''

  configure(options: {
    apiUrl: string
    projectId?: string
    onEvent: EventHandler
    onHistory?: HistoryHandler
    onStatus?: StatusHandler
  }) {
    this.apiUrl = options.apiUrl.trim()
    this.projectId = options.projectId
    this.onEvent = options.onEvent
    this.onHistory = options.onHistory ?? null
    this.onStatus = options.onStatus ?? null
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN
  }

  /** Same endpoint already connected — skip tear-down/reconnect. */
  matches(apiUrl: string, projectId?: string) {
    return (
      this.connected &&
      this.apiUrl === apiUrl.trim() &&
      (this.projectId || '') === (projectId || '')
    )
  }

  start() {
    this.stopped = false
    this.connect()
  }

  stop() {
    this.stopped = true
    this.clearReconnect()
    this.closeSocket()
    this.emitStatus({ connected: false, message: 'disconnected' })
  }

  private clearReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private closeSocket() {
    const socket = this.socket
    this.socket = null
    if (!socket) return
    try {
      socket.close()
    } catch {
      // ignore
    }
  }

  private emitStatus(status: { connected: boolean; message?: string }) {
    const key = `${status.connected}:${status.message || ''}`
    if (key !== this.lastStatusLog) {
      this.lastStatusLog = key
      if (status.connected) {
        console.log('[notifications] realtime connected')
      } else if (status.message && status.message !== 'disconnected') {
        console.log(`[notifications] realtime ${status.message}`)
      }
    }
    this.onStatus?.(status)
  }

  private connect() {
    if (this.stopped) return
    if (!this.apiUrl) {
      this.emitStatus({ connected: false, message: 'apiUrl is empty' })
      return
    }

    // Already on the right socket — do not bounce the connection.
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return
    }

    const token = loadNotificationsApiToken() || ''
    let wsUrl: string
    try {
      wsUrl = toWsUrl(this.apiUrl, token, this.projectId)
    } catch (error) {
      this.emitStatus({
        connected: false,
        message: error instanceof Error ? error.message : 'Invalid apiUrl',
      })
      return
    }

    this.clearReconnect()
    this.closeSocket()

    let socket: WebSocket
    try {
      socket = new WebSocket(wsUrl)
      this.socket = socket
    } catch (error) {
      this.emitStatus({
        connected: false,
        message: error instanceof Error ? error.message : 'WebSocket open failed',
      })
      this.scheduleReconnect()
      return
    }

    socket.addEventListener('open', () => {
      if (this.socket !== socket || this.stopped) return
      this.attempt = 0
      this.emitStatus({ connected: true, message: 'connected' })
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
      socket.send(JSON.stringify(subscribe))
    })

    socket.addEventListener('message', (message) => {
      if (this.socket !== socket) return
      try {
        const data = JSON.parse(String(message.data)) as {
          type?: string
          clientId?: string
          history?: RealtimeBoardEvent[]
          event?: RealtimeBoardEvent
          message?: string
        }
        if (data.type === 'hello') {
          const history = Array.isArray(data.history) ? data.history : []
          if (history.length) this.onHistory?.(history)
          return
        }
        if (data.type === 'error') {
          console.warn(`[notifications] ws error: ${data.message || 'unknown'}`)
          return
        }
        if (data.type === 'event' && data.event) {
          this.onEvent?.(data.event)
        }
      } catch {
        // ignore malformed frames
      }
    })

    socket.addEventListener('close', () => {
      // Ignore close from a superseded/replaced socket — prevents reconnect storms.
      if (this.socket !== socket) return
      this.socket = null
      this.emitStatus({ connected: false, message: 'disconnected' })
      this.scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      if (this.socket !== socket) return
      // `close` follows; reconnect is scheduled there.
    })
  }

  private scheduleReconnect() {
    if (this.stopped || !this.apiUrl) return
    if (this.reconnectTimer) return
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.attempt, 5))
    this.attempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }
}
