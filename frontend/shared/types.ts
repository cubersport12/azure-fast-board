export type AuthMethod = 'pat' | 'password'

export interface ConnectionConfig {
  serverUrl: string
  collection: string
  project: string
  team: string
  apiVersion: string
  /** Windows/domain username (DOMAIN\\user or email) */
  username?: string
  authMethod?: AuthMethod
}

export interface NamedEntity {
  id: string
  name: string
}

export interface ConnectionCredentials {
  serverUrl: string
  apiVersion?: string
  collection?: string
  project?: string
  insecureTls?: boolean
  username?: string
  authMethod?: AuthMethod
  pat?: string
  password?: string
}

export interface ConnectionSecretInput {
  pat?: string
  password?: string
}

export interface ConnectionTestResult {
  ok: boolean
  message: string
  collections?: NamedEntity[]
  projects?: NamedEntity[]
  teams?: NamedEntity[]
  apiVersion?: string
}

/** Locally subscribed sprint/iteration (personal preference, not TFS team settings). */
export interface SubscribedIteration {
  path: string
  name: string
}

export interface AppSettings {
  launchMinimized: boolean
  hideToTrayOnClose: boolean
  globalHotkey: string
  quickCreateHotkey: string
  theme: 'system' | 'light' | 'dark'
  defaultView: 'board' | 'list'
  pollIntervalMs: number
  insecureTls: boolean
  /** Personal sprint subscriptions (paths). */
  subscribedIterations: SubscribedIteration[]
  /** Empty = «Не выбрано» (show all work items). */
  selectedIterationPath: string
  /** Last assignee used in quick create (empty = Unassigned). */
  lastAssignee: string
  /** Persisted board/list filters; empty arrays = no restriction. */
  filters: {
    types: string[]
    states: string[]
    assignees: string[]
    creators: string[]
    tags: string[]
  }
}

export interface WorkItem {
  id: number
  rev: number
  title: string
  type: string
  state: string
  boardColumn?: string
  assignedTo?: string
  assignedToUniqueName?: string
  createdBy?: string
  createdByUniqueName?: string
  areaPath?: string
  iterationPath?: string
  tags: string[]
  priority?: number
  severity?: string
  changedDate?: string
  createdDate?: string
  description?: string
  url?: string
}

export interface WorkItemComment {
  id: number
  text: string
  createdBy: string
  createdDate: string
}

export interface WorkItemAttachment {
  id: string
  name: string
  url: string
}

export interface WorkItemDetail extends WorkItem {
  comments: WorkItemComment[]
  attachments: WorkItemAttachment[]
  history: Array<{ rev: number; changedDate: string; changedBy: string; fields: Record<string, unknown> }>
  relations: Array<{ rel: string; url: string; attributes?: Record<string, unknown> }>
  fields: Record<string, unknown>
}

export interface CreateWorkItemInput {
  type: string
  title: string
  description?: string
  assignedTo?: string
  areaPath?: string
  iterationPath?: string
  tags?: string[]
  boardColumn?: string
  fields?: Record<string, string | number | boolean | null>
  attachments?: AttachmentUpload[]
}

export interface AddCommentInput {
  id: number
  text: string
  attachments?: AttachmentUpload[]
}

export interface PatchWorkItemInput {
  id: number
  rev: number
  fields: Record<string, string | number | boolean | null | undefined>
}

export interface BoardColumn {
  id: string
  name: string
  order: number
  itemLimit?: number
  stateMappings?: Record<string, string>
  isDone?: boolean
}

export interface WorkItemTypeInfo {
  name: string
  description?: string
  color?: string
  icon?: string
  states: Array<{ name: string; color?: string; category?: string }>
  fields: Array<{ referenceName: string; name: string; type: string; required?: boolean }>
}

export interface SavedView {
  id: string
  name: string
  kind: 'board' | 'list'
  query?: string
  filters?: {
    types?: string[]
    states?: string[]
    assignees?: string[]
    creators?: string[]
    tags?: string[]
    search?: string
  }
  columns?: string[]
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error' | 'offline'
  lastSyncedAt?: string
  message?: string
  itemCount?: number
}

export interface AttachmentUpload {
  fileName: string
  mimeType: string
  dataBase64: string
}

export interface MediaPayload {
  mimeType: string
  dataBase64: string
}

/** Person that can be assigned to a work item. */
export interface AssigneeIdentity {
  displayName: string
  uniqueName?: string
  id?: string
}

/** Azure DevOps Area Path (System.AreaPath), shown as "Area" in the web UI. */
export interface AreaPathOption {
  /** Full path value for System.AreaPath, e.g. Project\\Team\\Feature */
  path: string
  /** Short label for the dropdown */
  name: string
}

export interface AreaPathsResult {
  /** Root area path used for “Не указано” (usually Project or Project\\Area). */
  rootPath?: string
  defaultPath?: string
  areas: AreaPathOption[]
}

/** Azure DevOps Iteration Path (System.IterationPath). */
export interface IterationPathOption {
  path: string
  name: string
}

export interface IterationPathsResult {
  rootPath?: string
  iterations: IterationPathOption[]
}

export const DEFAULT_SETTINGS: AppSettings = {
  launchMinimized: true,
  hideToTrayOnClose: true,
  globalHotkey: 'CommandOrControl+Shift+Space',
  quickCreateHotkey: 'CommandOrControl+Shift+N',
  theme: 'system',
  defaultView: 'board',
  pollIntervalMs: 30000,
  insecureTls: false,
  subscribedIterations: [],
  selectedIterationPath: '',
  lastAssignee: '',
  filters: {
    types: [],
    states: [],
    assignees: [],
    creators: [],
    tags: [],
  },
}

export const DEFAULT_CONNECTION: ConnectionConfig = {
  serverUrl: 'https://devops.company.local',
  collection: 'DefaultCollection',
  project: '',
  team: '',
  apiVersion: '7.0',
}
