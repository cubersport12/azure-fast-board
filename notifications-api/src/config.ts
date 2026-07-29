export interface ApiConfig {
  host: string
  port: number
  hooksPath: string
  wsPath: string
  /** Shared secret: Authorization: Bearer <token> or ?token= / header x-afb-token */
  authToken: string
  /** Keep last N events for late subscribers / debugging. */
  historyLimit: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    host: env.HOST?.trim() || '0.0.0.0',
    port: Number(env.PORT || 8787) || 8787,
    hooksPath: env.HOOKS_PATH?.trim() || '/hooks/azure',
    wsPath: env.WS_PATH?.trim() || '/ws',
    authToken: env.AUTH_TOKEN?.trim() || '',
    historyLimit: Math.max(1, Number(env.HISTORY_LIMIT || 100) || 100),
  }
}
