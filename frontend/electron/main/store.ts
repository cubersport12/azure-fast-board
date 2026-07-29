import Store from 'electron-store'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_SETTINGS,
  type AppSettings,
  type ConnectionConfig,
  type NotificationSettings,
  type SavedView,
  type WorkItem,
} from '../../shared/types'
import { normalizeIterationFieldPath } from '../../shared/utils'
import { loadMattermostWebhookUrl, loadSmtpPassword } from './credentials'

interface StoreSchema {
  settings: AppSettings
  connection: ConnectionConfig | null
  views: SavedView[]
  cache: {
    workItems: WorkItem[]
    updatedAt?: string
  }
}

const store = new Store<StoreSchema>({
  name: 'azure-fast-board',
  defaults: {
    settings: DEFAULT_SETTINGS,
    connection: null,
    views: [],
    cache: { workItems: [] },
  },
})

function mergeNotificationSettings(
  raw?: Partial<NotificationSettings> | null,
): NotificationSettings {
  const base = DEFAULT_NOTIFICATION_SETTINGS
  const events = { ...base.events, ...(raw?.events ?? {}) }
  const providers = {
    app: { ...base.providers.app, ...(raw?.providers?.app ?? {}) },
    mattermost: {
      ...base.providers.mattermost,
      ...(raw?.providers?.mattermost ?? {}),
      webhookUrlConfigured: Boolean(loadMattermostWebhookUrl()),
    },
    email: {
      ...base.providers.email,
      ...(raw?.providers?.email ?? {}),
      passwordConfigured: Boolean(loadSmtpPassword()),
    },
  }
  return {
    enabled: raw?.enabled ?? base.enabled,
    onlyAssignedToMe: raw?.onlyAssignedToMe ?? base.onlyAssignedToMe,
    apiUrl: raw?.apiUrl?.trim() ?? base.apiUrl,
    events,
    providers,
  }
}

export function getSettings() {
  const settings = { ...DEFAULT_SETTINGS, ...store.get('settings') }
  const subscribedIterations = (settings.subscribedIterations ?? []).map((entry) => {
    const path = normalizeIterationFieldPath(entry.path)
    return {
      path,
      name: entry.name || path.split('\\').pop() || path,
    }
  })
  return {
    ...settings,
    subscribedIterations,
    selectedIterationPath: normalizeIterationFieldPath(settings.selectedIterationPath),
    lastAssignee: settings.lastAssignee ?? '',
    filters: {
      types: settings.filters?.types ?? [],
      states: settings.filters?.states ?? [],
      assignees: settings.filters?.assignees ?? [],
      creators: settings.filters?.creators ?? [],
      tags: settings.filters?.tags ?? [],
    },
    notifications: mergeNotificationSettings(settings.notifications),
  }
}

export function updateSettings(patch: Partial<AppSettings>) {
  const current = getSettings()
  const stored = store.get('settings')
  const next: AppSettings = {
    ...current,
    ...patch,
    notifications: current.notifications,
  }

  if (patch.subscribedIterations) {
    next.subscribedIterations = patch.subscribedIterations.map((entry) => {
      const path = normalizeIterationFieldPath(entry.path)
      return { path, name: entry.name || path.split('\\').pop() || path }
    })
  }
  if (patch.selectedIterationPath !== undefined) {
    next.selectedIterationPath = normalizeIterationFieldPath(patch.selectedIterationPath)
  }

  const notificationsSource = patch.notifications
    ? {
        ...((stored.notifications as NotificationSettings | undefined) ?? DEFAULT_NOTIFICATION_SETTINGS),
        ...patch.notifications,
        events: {
          ...DEFAULT_NOTIFICATION_SETTINGS.events,
          ...(stored.notifications as NotificationSettings | undefined)?.events,
          ...patch.notifications.events,
        },
        providers: {
          app: {
            ...DEFAULT_NOTIFICATION_SETTINGS.providers.app,
            ...(stored.notifications as NotificationSettings | undefined)?.providers?.app,
            ...patch.notifications.providers?.app,
          },
          mattermost: {
            enabled:
              patch.notifications.providers?.mattermost?.enabled ??
              (stored.notifications as NotificationSettings | undefined)?.providers?.mattermost
                ?.enabled ??
              DEFAULT_NOTIFICATION_SETTINGS.providers.mattermost.enabled,
            webhookUrlConfigured: false,
          },
          email: {
            ...DEFAULT_NOTIFICATION_SETTINGS.providers.email,
            ...(stored.notifications as NotificationSettings | undefined)?.providers?.email,
            ...patch.notifications.providers?.email,
            passwordConfigured: false,
          },
        },
      }
    : ((stored.notifications as NotificationSettings | undefined) ??
      DEFAULT_NOTIFICATION_SETTINGS)

  const toStore: AppSettings = {
    ...next,
    notifications: {
      enabled: notificationsSource.enabled,
      onlyAssignedToMe: notificationsSource.onlyAssignedToMe,
      apiUrl: notificationsSource.apiUrl?.trim() || '',
      events: { ...DEFAULT_NOTIFICATION_SETTINGS.events, ...notificationsSource.events },
      providers: {
        app: {
          ...DEFAULT_NOTIFICATION_SETTINGS.providers.app,
          ...notificationsSource.providers.app,
        },
        mattermost: {
          enabled: notificationsSource.providers.mattermost.enabled,
          webhookUrlConfigured: false,
        },
        email: {
          enabled: notificationsSource.providers.email.enabled,
          to: notificationsSource.providers.email.to,
          smtpHost: notificationsSource.providers.email.smtpHost,
          smtpPort: notificationsSource.providers.email.smtpPort,
          smtpSecure: notificationsSource.providers.email.smtpSecure,
          smtpUser: notificationsSource.providers.email.smtpUser,
          passwordConfigured: false,
        },
      },
    },
  }

  store.set('settings', toStore)
  return getSettings()
}

export function getConnection() {
  return store.get('connection')
}

export function saveConnection(config: ConnectionConfig) {
  store.set('connection', config)
  return config
}

export function clearConnection() {
  store.set('connection', null)
}

export function getViews() {
  return store.get('views')
}

export function saveView(view: SavedView) {
  const views = getViews().filter((item) => item.id !== view.id)
  views.push(view)
  store.set('views', views)
  return views
}

export function deleteView(id: string) {
  const views = getViews().filter((item) => item.id !== id)
  store.set('views', views)
  return views
}

export function getCachedWorkItems() {
  return store.get('cache')
}

export function setCachedWorkItems(items: WorkItem[]) {
  store.set('cache', { workItems: items, updatedAt: new Date().toISOString() })
}
