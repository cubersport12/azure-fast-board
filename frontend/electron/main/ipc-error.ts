import { AzureDevOpsError } from './azure/errors'
import { formatNetworkError } from './azure/http'

export function toIpcError(error: unknown): Error {
  if (error instanceof AzureDevOpsError) return error
  return new Error(formatNetworkError(error))
}
