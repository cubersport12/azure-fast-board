import type {
  AppSettings,
  AttachmentUpload,
  BoardColumn,
  BoardNotification,
  ConnectionConfig,
  ConnectionCredentials,
  ConnectionTestResult,
  AddCommentInput,
  CreateWorkItemInput,
  MediaPayload,
  NamedEntity,
  PatchWorkItemInput,
  SavedView,
  ServiceHookCreateInput,
  ServiceHookSubscription,
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
  workItemsRemoveAttachment: 'workItems:removeAttachment',
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
  serviceHooksList: 'serviceHooks:list',
  serviceHooksGet: 'serviceHooks:get',
  serviceHooksCreate: 'serviceHooks:create',
  serviceHooksDelete: 'serviceHooks:delete',
  serviceHooksTest: 'serviceHooks:test',
  notificationsSecretsSet: 'notifications:secrets:set',
  notificationsHistory: 'notifications:history',
  notificationsMarkRead: 'notifications:markRead',
  notificationsMarkReadByWorkItem: 'notifications:markReadByWorkItem',
  notificationsMarkAllRead: 'notifications:markAllRead',
  notificationsClear: 'notifications:clear',
  notificationsTest: 'notifications:test',
  eventShowQuickCreate: 'event:showQuickCreate',
  eventShowCommandPalette: 'event:showCommandPalette',
  eventNavigate: 'event:navigate',
  eventSyncStatus: 'event:syncStatus',
  eventNotification: 'event:notification',
  eventWorkItemsInvalidate: 'event:workItemsInvalidate',
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
  moveWorkItem: (id: number, column: string, rev: number, state?: string) => Promise<WorkItem>
  getComments: (id: number) => Promise<WorkItemComment[]>
  addComment: (input: AddCommentInput) => Promise<WorkItemComment>
  uploadAttachment: (id: number, file: AttachmentUpload) => Promise<WorkItemDetail>
  removeAttachment: (id: number, attachmentUrl: string) => Promise<WorkItemDetail>
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
  listServiceHooks: () => Promise<ServiceHookSubscription[]>
  getServiceHook: (id: string) => Promise<ServiceHookSubscription>
  createServiceHook: (input: ServiceHookCreateInput) => Promise<ServiceHookSubscription>
  deleteServiceHook: (id: string) => Promise<void>
  testServiceHook: (id: string) => Promise<{ ok: boolean; message: string }>
  setNotificationSecrets: (secrets: {
    mattermostWebhookUrl?: string | null
    smtpPassword?: string | null
    notificationsApiToken?: string | null
  }) => Promise<AppSettings>
  getNotificationHistory: () => Promise<BoardNotification[]>
  markNotificationRead: (id: string) => Promise<BoardNotification[]>
  markNotificationsReadByWorkItem: (workItemId: number) => Promise<BoardNotification[]>
  markAllNotificationsRead: () => Promise<BoardNotification[]>
  clearNotifications: () => Promise<BoardNotification[]>
  testNotification: () => Promise<BoardNotification>
  onShowQuickCreate: (cb: () => void) => () => void
  onShowCommandPalette: (cb: () => void) => () => void
  onNavigate: (cb: (route: string) => void) => () => void
  onSyncStatus: (cb: (status: SyncStatus) => void) => () => void
  onNotification: (cb: (notification: BoardNotification) => void) => () => void
  onWorkItemsInvalidate: (cb: (payload: { reason: string }) => void) => () => void
}
