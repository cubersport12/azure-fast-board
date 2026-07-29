import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ApiConfig } from './config.js'
import type { EventHub } from './hub.js'
import { mapServiceHookPayload } from './hooks.js'

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function extractToken(req: IncomingMessage, url: URL) {
  const auth = req.headers.authorization
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  const header = req.headers['x-afb-token']
  if (typeof header === 'string' && header.trim()) return header.trim()
  return url.searchParams.get('token')?.trim() || ''
}

function assertAuth(req: IncomingMessage, url: URL, config: ApiConfig, res: ServerResponse) {
  if (!config.authToken) return true
  if (extractToken(req, url) === config.authToken) return true
  sendJson(res, 401, { ok: false, message: 'Unauthorized' })
  return false
}

export function createRequestHandler(options: { config: ApiConfig; hub: EventHub }) {
  const { config, hub } = options
  hub.setHistoryLimit(config.historyLimit)

  return async function handler(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const method = (req.method || 'GET').toUpperCase()

    if (method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, ...hub.getStats() })
      return
    }

    if (method === 'GET' && url.pathname === '/events') {
      if (!assertAuth(req, url, config, res)) return
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 20) || 20))
      sendJson(res, 200, { ok: true, events: hub.getHistory().slice(0, limit) })
      return
    }

    if (method === 'POST' && url.pathname === config.hooksPath) {
      if (!assertAuth(req, url, config, res)) return
      try {
        const raw = await readBody(req)
        const text = raw.toString('utf8').trim()
        const json = text ? (JSON.parse(text) as unknown) : null
        const event = mapServiceHookPayload(json)
        if (!event) {
          sendJson(res, 400, { ok: false, message: 'Unrecognized service hook payload' })
          return
        }
        hub.publish(event)
        sendJson(res, 202, { ok: true, id: event.id, clients: hub.getStats().clients })
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          message: error instanceof Error ? error.message : 'Invalid JSON body',
        })
      }
      return
    }

    sendJson(res, 404, { ok: false, message: 'Not found' })
  }
}
