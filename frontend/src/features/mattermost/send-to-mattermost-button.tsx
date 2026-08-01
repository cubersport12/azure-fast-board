import { MessageSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getAzureApi } from '@/lib/azure-api'
import { cn } from '@/lib/utils'
import { useSettings } from '@/hooks/use-azure'
import { useUiStore } from '@/stores/ui-store'

export function SendToMattermostButton({
  workItemId,
  compact,
  className,
}: {
  workItemId: number
  compact?: boolean
  className?: string
}) {
  const { data: settings } = useSettings()
  const setShareId = useUiStore((s) => s.setMattermostShareWorkItemId)
  const [configured, setConfigured] = useState(false)

  const mm = settings?.notifications.providers.mattermost
  const settingsSayConfigured = Boolean(
    mm?.baseUrl?.trim() && mm?.loginId?.trim() && mm?.passwordConfigured,
  )

  useEffect(() => {
    const api = getAzureApi()
    if (!api?.isMattermostConfigured) {
      setConfigured(settingsSayConfigured)
      return
    }
    void api
      .isMattermostConfigured()
      .then(setConfigured)
      .catch(() => setConfigured(settingsSayConfigured))
  }, [settingsSayConfigured, settings?.notifications.providers.mattermost])

  const enabled = configured
  const title = enabled
    ? 'Отправить в MM на обсуждение'
    : 'Mattermost не настроен — укажите URL, логин и пароль в Настройках'

  if (compact) {
    return (
      <button
        type="button"
        title={title}
        disabled={!enabled}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-sky-950 dark:hover:text-sky-300',
          className,
        )}
        onClick={(event) => {
          event.stopPropagation()
          event.preventDefault()
          if (!enabled) return
          setShareId(workItemId)
        }}
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </button>
    )
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      title={title}
      disabled={!enabled}
      className={className}
      onClick={() => {
        if (!enabled) return
        setShareId(workItemId)
      }}
    >
      <MessageSquare className="h-4 w-4" />
      Отправить в MM
    </Button>
  )
}
