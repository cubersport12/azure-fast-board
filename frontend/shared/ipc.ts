import type {
  AppSettings,
  AttachmentUpload,
  BoardColumn,
  ConnectionConfig,
  ConnectionCredentials,
  ConnectionTestResult,
  AddCommentInput,
  CreateWorkItemInput,
  MediaPayload,
  NamedEntity,
  PatchWorkItemInput,
  SavedView,
  SyncStatus,
  AssigneeIdentity,
  AreaPathsResult,
  IterationPathsResult,
  WorkItem,
  WorkItemComment,
  WorkItemDetail,
  WorkItemTypeInfo,
} from './types'

export const IPC_CHANNELS = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  connectionGet: 'connection:get',
  connectionSave: 'connection:save',
  connectionClear: 'connection:clear',
  connectionTest: 'connection:test',
  connectionVerify: 'connection:verify',
  connectionListCollections: 'connection:listCollections',
  connectionListProjects: 'connection:listProjects',
  connectionListTeams: 'connection:listTeams',
  workItemsList: 'workItems:list',
  workItemsGet: 'workItems:get',
  workItemsCreate: 'workItems:create',
  workItemsUpdate: 'workItems:update',
  workItemsMove: 'workItems:move',
  workItemsComments: 'workItems:comments',
  workItemsAddComment: 'workItems:addComment',
  workItemsUploadAttachment: 'workItems:uploadAttachment',
  mediaFetch: 'media:fetch',
  boardColumns: 'board:columns',
  workItemTypes: 'meta:workItemTypes',
  assigneesList: 'meta:assignees',
  assigneesSearch: 'meta:assigneesSearch',
  currentUser: 'meta:currentUser',
  areaPaths: 'meta:areaPaths',
  iterationPaths: 'meta:iterationPaths',
  viewsList: 'views:list',
  viewsSave: 'views:save',
  viewsDelete: 'views:delete',
  syncStatus: 'sync:status',
  windowShow: 'window:show',
  windowHide: 'window:hide',
  appQuit: 'app:quit',
  autoLaunchGet: 'app:autoLaunch:get',
  autoLaunchSet: 'app:autoLaunch:set',
  clipboardReadImage: 'clipboard:readImage',
  openExternal: 'shell:openExternal',
  eventShowQuickCreate: 'event:showQuickCreate',
  eventShowCommandPalette: 'event:showCommandPalette',
  eventNavigate: 'event:navigate',
  eventSyncStatus: 'event:syncStatus',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

export interface AzureFastBoardApi {
  getSettings: () => Promise<AppSettings>
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  getConnection: () => Promise<ConnectionConfig | null>
  saveConnection: (config: ConnectionConfig & { pat?: string; password?: string }) => Promise<ConnectionConfig>
  clearConnection: () => Promise<void>
  testConnection: (
    config: ConnectionConfig & { pat?: string; password?: string },
  ) => Promise<ConnectionTestResult>
  verifyConnection: () => Promise<{ ok: true; message: string }>
  listCollections: (
    creds: ConnectionCredentials,
  ) => Promise<{ collections: NamedEntity[]; apiVersion: string; serverUrl: string }>
  listProjects: (creds: ConnectionCredentials & { collection: string }) => Promise<NamedEntity[]>
  listTeams: (
    creds: ConnectionCredentials & { collection: string; project: string },
  ) => Promise<NamedEntity[]>
  listWorkItems: (query?: string) => Promise<WorkItem[]>
  getWorkItem: (id: number) => Promise<WorkItemDetail>
  createWorkItem: (input: CreateWorkItemInput) => Promise<WorkItem>
  updateWorkItem: (input: PatchWorkItemInput) => Promise<WorkItem>
  moveWorkItem: (id: number, column: string, rev: number) => Promise<WorkItem>
  getComments: (id: number) => Promise<WorkItemComment[]>
  addComment: (input: AddCommentInput) => Promise<WorkItemComment>
  uploadAttachment: (id: number, file: AttachmentUpload) => Promise<WorkItemDetail>
  fetchMedia: (url: string) => Promise<MediaPayload>
  getBoardColumns: () => Promise<BoardColumn[]>
  getWorkItemTypes: () => Promise<WorkItemTypeInfo[]>
  listAssignees: () => Promise<AssigneeIdentity[]>
  searchAssignees: (query: string) => Promise<AssigneeIdentity[]>
  getCurrentUser: () => Promise<AssigneeIdentity>
  listAreaPaths: () => Promise<AreaPathsResult>
  listIterationPaths: () => Promise<IterationPathsResult>
  listViews: () => Promise<SavedView[]>
  saveView: (view: SavedView) => Promise<SavedView[]>
  deleteView: (id: string) => Promise<SavedView[]>
  getSyncStatus: () => Promise<SyncStatus>
  showWindow: () => Promise<void>
  hideWindow: () => Promise<void>
  quitApp: () => Promise<void>
  getAutoLaunch: () => Promise<boolean>
  setAutoLaunch: (enabled: boolean) => Promise<boolean>
  readClipboardImage: () => Promise<AttachmentUpload | null>
  openExternal: (url: string) => Promise<void>
  onShowQuickCreate: (cb: () => void) => () => void
  onShowCommandPalette: (cb: () => void) => () => void
  onNavigate: (cb: (route: string) => void) => () => void
  onSyncStatus: (cb: (status: SyncStatus) => void) => () => void
}
