import { getAzureApi } from '@/lib/azure-api'

/** Log to DevTools and to the npm/Electron main terminal. */
export function debugLog(message: string, data?: unknown) {
  if (data !== undefined) console.log(message, data)
  else console.log(message)
  void getAzureApi()
    ?.debugLog?.(message, data)
    .catch(() => undefined)
}
