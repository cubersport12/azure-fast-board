import http from 'node:http'
import https from 'node:https'
import { net, session } from 'electron'
import { AzureDevOpsError } from './errors'

export function formatNetworkError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)

  const parts = [error.message]
  const cause = (error as Error & { cause?: unknown }).cause
  if (cause instanceof Error) {
    parts.push(cause.message)
    const code = (cause as NodeJS.ErrnoException).code
    if (code) parts.push(`(${code})`)
  } else if (cause && typeof cause === 'object') {
    const maybe = cause as { message?: string; code?: string }
    if (maybe.message) parts.push(maybe.message)
    if (maybe.code) parts.push(`(${maybe.code})`)
  }

  const joined = parts.filter(Boolean).join(' — ')
  if (/certificate|CERT_|UNABLE_TO_VERIFY|SSL|TLS/i.test(joined)) {
    return `${joined}. Tip: enable "Allow insecure TLS" in Settings for corporate/self-signed certificates.`
  }
  if (/ENOTFOUND|getaddrinfo/i.test(joined)) {
    return `${joined}. Check Server URL / DNS (VPN may be required).`
  }
  if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(joined)) {
    return `${joined}. Server unreachable — check URL, VPN and firewall.`
  }
  return joined
}

export function applyInsecureTls(enabled: boolean) {
  if (!enabled) return
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  try {
    session.defaultSession.setCertificateVerifyProc((_request, callback) => {
      // 0 = success / accept certificate
      callback(0)
    })
  } catch {
    // session may be unavailable very early; env fallback still helps Node paths
  }
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) return Object.fromEntries(headers.entries())
  if (Array.isArray(headers)) return Object.fromEntries(headers)
  return { ...headers }
}

function bodyToBuffer(body: RequestInit['body']): Buffer | undefined {
  if (body == null) return undefined
  if (typeof body === 'string') return Buffer.from(body)
  if (Buffer.isBuffer(body)) return body
  if (body instanceof Uint8Array) return Buffer.from(body)
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  return Buffer.from(String(body))
}

/**
 * Real Node.js http/https request (not Electron/Chromium fetch).
 * Needed for PAT Basic auth: in Electron main, global fetch === net.fetch (Chromium),
 * which often fails Basic against IIS Windows Authentication.
 */
export function nodeHttpRequest(
  url: string,
  init: RequestInit = {},
  options?: { insecureTls?: boolean },
): Promise<Response> {
  return new Promise((resolve, reject) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch (error) {
      reject(new AzureDevOpsError(formatNetworkError(error), 0))
      return
    }

    const isHttps = parsed.protocol === 'https:'
    const transport = isHttps ? https : http
    const method = (init.method || 'GET').toUpperCase()
    const headers = headersToRecord(init.headers)
    const payload = bodyToBuffer(init.body)

    if (payload && !headers['Content-Length'] && !headers['content-length']) {
      headers['Content-Length'] = String(payload.byteLength)
    }

    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
        agent: isHttps
          ? new https.Agent({
              keepAlive: true,
              rejectUnauthorized: !options?.insecureTls,
            })
          : new http.Agent({ keepAlive: true }),
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        res.on('end', () => {
          const body = Buffer.concat(chunks)
          const headerInit: Record<string, string> = {}
          for (const [key, value] of Object.entries(res.headers)) {
            if (value == null) continue
            headerInit[key] = Array.isArray(value) ? value.join(', ') : value
          }
          resolve(
            new Response(body, {
              status: res.statusCode || 0,
              statusText: res.statusMessage || '',
              headers: headerInit,
            }),
          )
        })
      },
    )

    req.on('error', (error) => {
      reject(new AzureDevOpsError(formatNetworkError(error), 0))
    })

    if (payload) req.write(payload)
    req.end()
  })
}

/**
 * Prefer Electron Chromium networking so Windows corporate CA trust works.
 * Falls back to global fetch if net.fetch is unavailable.
 * Use `preferNode: true` for PAT — routes through nodeHttpRequest.
 */
export async function azureFetch(
  url: string,
  init: RequestInit = {},
  options?: { preferNode?: boolean; insecureTls?: boolean },
): Promise<Response> {
  if (options?.preferNode) {
    return nodeHttpRequest(url, init, { insecureTls: options.insecureTls })
  }

  const headers = headersToRecord(init.headers)
  const nextInit: RequestInit = { ...init, headers }

  try {
    if (typeof net.fetch === 'function') {
      return await net.fetch(url, nextInit as RequestInit)
    }
  } catch (error) {
    try {
      return await fetch(url, nextInit)
    } catch {
      throw new AzureDevOpsError(formatNetworkError(error), 0)
    }
  }

  try {
    return await fetch(url, nextInit)
  } catch (error) {
    throw new AzureDevOpsError(formatNetworkError(error), 0)
  }
}
