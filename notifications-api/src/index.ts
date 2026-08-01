import { createServer } from 'node:http'
import { loadConfig } from './config.js'
import { EventHub } from './hub.js'
import { createRequestHandler } from './http.js'

const config = loadConfig()
const hub = new EventHub()
const handler = createRequestHandler({ config, hub })
const server = createServer(handler)

hub.attach(server, {
  path: config.wsPath,
  authToken: config.authToken,
})

server.listen(config.port, config.host, () => {
  console.log(
    `[notifications-api] listening on http://${config.host}:${config.port}`,
  )
  console.log(`[notifications-api] service hooks POST ${config.hooksPath}`)
  console.log(`[notifications-api] websocket ${config.wsPath}`)
})
