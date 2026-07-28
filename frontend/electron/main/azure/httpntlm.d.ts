declare module 'httpntlm' {
  interface NtlmOptions {
    url: string
    username?: string
    password?: string
    domain?: string
    workstation?: string
    headers?: Record<string, string>
    body?: string | Buffer
    json?: unknown
    rejectUnauthorized?: boolean
    allowRedirects?: boolean
    timeout?: number
  }

  interface NtlmResponse {
    headers: Record<string, string | string[] | undefined>
    body: string | Buffer
    statusCode: number
  }

  type Callback = (error: Error | null, response: NtlmResponse) => void

  interface HttpNtlm {
    get: (options: NtlmOptions, cb: Callback) => void
    post: (options: NtlmOptions, cb: Callback) => void
    put: (options: NtlmOptions, cb: Callback) => void
    patch: (options: NtlmOptions, cb: Callback) => void
    delete: (options: NtlmOptions, cb: Callback) => void
    method: (method: string, options: NtlmOptions, cb: Callback) => void
  }

  const httpntlm: HttpNtlm
  export default httpntlm
}
