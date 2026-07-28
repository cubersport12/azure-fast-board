export class AzureDevOpsError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.name = 'AzureDevOpsError'
    this.status = status
  }
}
