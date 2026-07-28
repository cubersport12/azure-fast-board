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

/**
 * Prefer Electron Chromium networking so Windows corporate CA trust works.
 * Falls back to global fetch if net.fetch is unavailable.
 */
export async function azureFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    if (typeof net.fetch === 'function') {
      return await net.fetch(url, init as RequestInit)
    }
  } catch (error) {
    // If Chromium path fails hard, try Node fetch once more for clearer errors
    try {
      return await fetch(url, init)
    } catch {
      throw new AzureDevOpsError(formatNetworkError(error), 0)
    }
  }

  try {
    return await fetch(url, init)
  } catch (error) {
    throw new AzureDevOpsError(formatNetworkError(error), 0)
  }
}
