import { randomUUID } from 'node:crypto'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { BoardRealtimeEvent, ServerMessage, SubscribeMessage } from './types.js'

interface ClientState {
  id: string
  socket: WebSocket
  projectIds: Set<string> | null
  eventTypes: Set<string> | null
}

export interface HubAttachOptions {
  path: string
  authToken: string
}

function parseQuery(url: string) {
  try {
    const parsed = new URL(url, 'http://localhost')
    return parsed.searchParams
  } catch {
    return new URLSearchParams()
  }
}

function extractToken(req: IncomingMessage) {
  const auth = req.headers.authorization
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  const header = req.headers['x-afb-token']
  if (typeof header === 'string' && header.trim()) return header.trim()
  const query = parseQuery(req.url || '/')
  return query.get('token')?.trim() || ''
}

function matchesFilters(client: ClientState, event: BoardRealtimeEvent) {
  if (client.projectIds && client.projectIds.size > 0) {
    if (!event.projectId || !client.projectIds.has(event.projectId.toLowerCase())) {
      return false
    }
  }
  if (client.eventTypes && client.eventTypes.size > 0) {
    if (!client.eventTypes.has(event.eventType.toLowerCase())) return false
  }
  return true
}

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

export class EventHub {
  private clients = new Map<string, ClientState>()
  private history: BoardRealtimeEvent[] = []
  private historyLimit = 100
  private wss: WebSocketServer | null = null

  setHistoryLimit(limit: number) {
    this.historyLimit = Math.max(1, limit)
  }

  attach(server: HttpServer, options: HubAttachOptions) {
    this.wss = new WebSocketServer({ noServer: true })

    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url || '/', 'http://localhost')
      if (url.pathname !== options.path) {
        socket.destroy()
        return
      }

      if (options.authToken) {
        const token = extractToken(req)
        if (token !== options.authToken) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
          socket.destroy()
          return
        }
      }

      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.wss!.emit('connection', ws, req)
      })
    })

    this.wss.on('connection', (socket, req) => {
      const id = randomUUID()
      const query = parseQuery(req.url || '/')
      const projectIds = query.getAll('projectId').map((v) => v.toLowerCase()).filter(Boolean)
      const eventTypes = query.getAll('eventType').map((v) => v.toLowerCase()).filter(Boolean)

      const client: ClientState = {
        id,
        socket,
        projectIds: projectIds.length ? new Set(projectIds) : null,
        eventTypes: eventTypes.length ? new Set(eventTypes) : null,
      }
      this.clients.set(id, client)
      console.log(
        `[notifications-api] ws client connected id=${id}` +
          ` projectIds=${projectIds.join(',') || '*'}` +
          ` eventTypes=${eventTypes.join(',') || '*'}`,
      )

      const helloHistory = this.history.filter((event) => matchesFilters(client, event)).slice(0, 20)
      send(socket, { type: 'hello', clientId: id, history: helloHistory })

      socket.on('message', (raw) => {
        try {
          const parsed = JSON.parse(String(raw)) as SubscribeMessage
          if (parsed?.type !== 'subscribe') return
          const nextProjects = (parsed.filters?.projectIds ?? [])
            .map((v) => v.toLowerCase())
            .filter(Boolean)
          const nextEvents = (parsed.filters?.eventTypes ?? [])
            .map((v) => v.toLowerCase())
            .filter(Boolean)
          client.projectIds = nextProjects.length ? new Set(nextProjects) : null
          client.eventTypes = nextEvents.length ? new Set(nextEvents) : null
          console.log(
            `[notifications-api] ws client subscribed id=${id}` +
              ` projectIds=${nextProjects.join(',') || '*'}` +
              ` eventTypes=${nextEvents.join(',') || '*'}`,
          )
        } catch {
          send(socket, { type: 'error', message: 'Invalid subscribe message' })
        }
      })

      socket.on('close', () => {
        this.clients.delete(id)
        console.log(`[notifications-api] ws client disconnected id=${id}`)
      })
    })
  }

  publish(event: BoardRealtimeEvent) {
    this.history = [event, ...this.history].slice(0, this.historyLimit)
    let delivered = 0
    for (const client of this.clients.values()) {
      if (!matchesFilters(client, event)) continue
      send(client.socket, { type: 'event', event })
      delivered += 1
    }
    console.log(
      `[notifications-api] fan-out eventType=${event.eventType}` +
        ` workItemId=${event.workItemId ?? '-'}` +
        ` clients=${delivered}/${this.clients.size}`,
    )
  }

  getStats() {
    return {
      clients: this.clients.size,
      history: this.history.length,
    }
  }

  getHistory() {
    return [...this.history]
  }
}
