import { createRequire } from 'node:module'
import http from 'node:http'
import https from 'node:https'
import { AzureDevOpsError } from './errors'
import { applyInsecureTls, formatNetworkError } from './http'

const require = createRequire(import.meta.url)

type NtlmCallback = (
  error: Error | null,
  response: { headers: Record<string, string | string[] | undefined>; body: string | Buffer; statusCode: number },
) => void

const httpntlm = require('httpntlm') as {
  method: (
    method: string,
    options: Record<string, unknown>,
    cb: NtlmCallback,
  ) => void
}

export function parseWindowsUser(username: string): { user: string; domain: string } {
  const value = username.trim()
  if (value.includes('\\')) {
    const [domain, ...rest] = value.split('\\')
    return { domain: domain || '', user: rest.join('\\') }
  }
  return { domain: '', user: value }
}

function headersToRecord(headers: Headers | Record<string, string>): Record<string, string> {
  if (headers instanceof Headers) {
    const out: Record<string, string> = {}
    headers.forEach((value, key) => {
      if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'connection') return
      out[key] = value
    })
    return out
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'connection') continue
    out[key] = value
  }
  return out
}

function bodyToPayload(body: RequestInit['body']): string | Buffer | undefined {
  if (body == null) return undefined
  if (typeof body === 'string') return body
  if (Buffer.isBuffer(body)) return body
  if (body instanceof Uint8Array) return Buffer.from(body)
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  return String(body)
}

function isTlsError(error: unknown) {
  const text = error instanceof Error ? `${error.message} ${String((error as Error & { cause?: unknown }).cause ?? '')}` : String(error)
  return /certificate|CERT_|UNABLE_VERIFY|UNABLE_TO_VERIFY|SSL|TLS|self.signed/i.test(text)
}

function runNtlm(options: {
  url: string
  method: string
  username: string
  password: string
  domain: string
  headers: Record<string, string>
  body?: string | Buffer
  insecureTls: boolean
  binary?: boolean
}): Promise<{ status: number; bodyText: string; body: Buffer; contentType: string }> {
  const isHttps = options.url.startsWith('https:')
  // httpntlm creates its own Agent and ignores rejectUnauthorized unless agent is provided.
  const agent = isHttps
    ? new https.Agent({
        keepAlive: true,
        rejectUnauthorized: !options.insecureTls,
      })
    : new http.Agent({ keepAlive: true })

  if (options.insecureTls) {
    applyInsecureTls(true)
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  }

  return new Promise((resolve, reject) => {
    httpntlm.method(
      options.method,
      {
        url: options.url,
        username: options.username,
        password: options.password,
        domain: options.domain,
        workstation: 'AzureFastBoard',
        headers: options.headers,
        body: options.body,
        agent,
        binary: Boolean(options.binary),
        rejectUnauthorized: !options.insecureTls,
        allowRedirects: false,
        timeout: 60_000,
      },
      (error, response) => {
        if (error) {
          reject(new AzureDevOpsError(formatNetworkError(error), 0))
          return
        }

        const body = Buffer.isBuffer(response.body)
          ? response.body
          : Buffer.from(response.body ?? '', typeof response.body === 'string' ? 'utf8' : undefined)

        const bodyText = options.binary ? '' : body.toString('utf8')

        const rawType = response.headers['content-type']
        const contentType = Array.isArray(rawType) ? rawType[0] || '' : rawType || ''

        resolve({
          status: response.statusCode,
          bodyText,
          body,
          contentType,
        })
      },
    )
  })
}

export async function ntlmRequest(options: {
  url: string
  method?: string
  username: string
  password: string
  headers?: Headers | Record<string, string>
  body?: RequestInit['body']
  insecureTls?: boolean
  binary?: boolean
}): Promise<{ status: number; bodyText: string; body: Buffer; contentType: string }> {
  const { user, domain } = parseWindowsUser(options.username)
  const method = (options.method || 'GET').toLowerCase()
  const headers = {
    Accept: options.binary ? '*/*' : 'application/json',
    ...headersToRecord(options.headers || {}),
  }
  const body = bodyToPayload(options.body)
  const insecureTls = Boolean(options.insecureTls)
  const binary = Boolean(options.binary)

  try {
    return await runNtlm({
      url: options.url,
      method,
      username: user,
      password: options.password,
      domain,
      headers,
      body,
      insecureTls,
      binary,
    })
  } catch (error) {
    // Auto-retry once with insecure TLS for corporate self-signed certs
    if (!insecureTls && isTlsError(error)) {
      return runNtlm({
        url: options.url,
        method,
        username: user,
        password: options.password,
        domain,
        headers,
        body,
        insecureTls: true,
        binary,
      })
    }
    throw error
  }
}
