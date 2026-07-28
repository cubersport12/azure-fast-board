import type { AzureFastBoardApi } from '../../shared/ipc'

declare global {
  interface Window {
    azureFastBoard?: AzureFastBoardApi
  }
}

export {}
