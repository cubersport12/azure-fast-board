import { createServer } from 'node:http'
import { afterAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { EventHub } from '../src/hub.js'
import { createRequestHandler } from '../src/http.js'
import type { ApiConfig } from '../src/config.js'

describe('hooks → websocket fan-out', () => {
  const config: ApiConfig = {
    host: '127.0.0.1',
    port: 0,
    hooksPath: '/hooks/azure',
    wsPath: '/ws',
    authToken: 'secret',
    historyLimit: 10,
  }
  const hub = new EventHub()
  const server = createServer(createRequestHandler({ config, hub }))
  hub.attach(server, { path: config.wsPath, authToken: config.authToken })

  let baseUrl = ''
  let wsUrl = ''

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('publishes service hook events to subscribers', async () => {
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('no address')
    baseUrl = `http://127.0.0.1:${address.port}`
    wsUrl = `ws://127.0.0.1:${address.port}/ws?token=secret`

    const received = new Promise<Record<string, unknown>>((resolve, reject) => {
      const socket = new WebSocket(wsUrl)
      const timer = setTimeout(() => reject(new Error('timeout')), 5000)
      socket.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as { type?: string; event?: Record<string, unknown> }
        if (msg.type === 'event' && msg.event) {
          clearTimeout(timer)
          socket.close()
          resolve(msg.event)
        }
      })
      socket.on('error', reject)
    })

    // wait briefly for ws hello
    await new Promise((r) => setTimeout(r, 100))

    const response = await fetch(`${baseUrl}/hooks/azure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret',
      },
      body: JSON.stringify({
        id: 'n1',
        eventType: 'workitem.created',
        createdDate: new Date().toISOString(),
        resource: {
          id: 55,
          fields: { 'System.Title': 'From hook' },
        },
        resourceContainers: { project: { id: 'p1' } },
      }),
    })
    expect(response.status).toBe(202)

    const event = await received
    expect(event).toMatchObject({
      eventType: 'workitem.created',
      workItemId: 55,
      workItemTitle: 'From hook',
    })
  })
})
