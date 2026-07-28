import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys, useConnection } from '@/hooks/use-azure'
import { requireAzureApi } from '@/lib/azure-api'
import { useUiStore } from '@/stores/ui-store'

function looksLikeAuthError(message?: string | null) {
  return Boolean(
    message && /auth|401|403|unauthorized|credentials|login|ntlm|авториз|не настроено/i.test(message),
  )
}

export function useConnectionGate() {
  const qc = useQueryClient()
  const setConnectionOpen = useUiStore((s) => s.setConnectionOpen)
  const setConnectionReady = useUiStore((s) => s.setConnectionReady)
  const syncStatus = useUiStore((s) => s.syncStatus)
  const connectionQuery = useConnection()

  const verifyQuery = useQuery({
    queryKey: [...queryKeys.connection, 'verify'] as const,
    queryFn: () => requireAzureApi().verifyConnection(),
    enabled: Boolean(connectionQuery.data),
    retry: false,
    staleTime: 15_000,
  })

  const checking =
    connectionQuery.isLoading ||
    connectionQuery.isFetching ||
    (Boolean(connectionQuery.data) && (verifyQuery.isLoading || verifyQuery.isFetching))

  const authBroken =
    syncStatus.state === 'error' && looksLikeAuthError(syncStatus.message)

  const ready = Boolean(connectionQuery.data) && verifyQuery.isSuccess && !authBroken
  const blocked = !checking && !ready
  const errorMessage =
    verifyQuery.error instanceof Error
      ? verifyQuery.error.message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
      : authBroken
        ? syncStatus.message || 'Ошибка авторизации'
        : !connectionQuery.data && !checking
          ? 'Подключение не настроено'
          : null

  useEffect(() => {
    setConnectionReady(ready)
  }, [ready, setConnectionReady])

  useEffect(() => {
    if (blocked) setConnectionOpen(true)
  }, [blocked, setConnectionOpen])

  useEffect(() => {
    if (!authBroken) return
    void qc.resetQueries({ queryKey: [...queryKeys.connection, 'verify'] })
  }, [authBroken, qc])

  return {
    ready,
    blocked,
    checking,
    connection: connectionQuery.data,
    errorMessage,
    refetch: async () => {
      await connectionQuery.refetch()
      await verifyQuery.refetch()
    },
  }
}
