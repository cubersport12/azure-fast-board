import type { AzureFastBoardApi } from '../../shared/ipc'

/** Safe access to the preload bridge; returns null if preload failed to load. */
export function getAzureApi(): AzureFastBoardApi | null {
  return window.azureFastBoard ?? null
}

export function requireAzureApi(): AzureFastBoardApi {
  const api = getAzureApi()
  if (!api) {
    throw new Error('Azure Fast Board preload bridge is unavailable. Restart the app.')
  }
  return api
}
