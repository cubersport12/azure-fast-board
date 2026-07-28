import Store from 'electron-store'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type ConnectionConfig,
  type SavedView,
  type WorkItem,
} from '../../shared/types'

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

export function getSettings() {
  return store.get('settings')
}

export function updateSettings(patch: Partial<AppSettings>) {
  const next = { ...getSettings(), ...patch }
  store.set('settings', next)
  return next
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
