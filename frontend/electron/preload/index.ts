import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS, type AzureFastBoardApi } from '../../shared/ipc'
import type {
  AppSettings,
  AttachmentUpload,
  ConnectionConfig,
  CreateWorkItemInput,
  PatchWorkItemInput,
  SavedView,
} from '../../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void) {
  const listener = (_event: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

const api: AzureFastBoardApi = {
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, patch),
  getConnection: () => ipcRenderer.invoke(IPC_CHANNELS.connectionGet),
  saveConnection: (config: ConnectionConfig & { pat?: string; password?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.connectionSave, config),
  clearConnection: () => ipcRenderer.invoke(IPC_CHANNELS.connectionClear),
  testConnection: (config: ConnectionConfig & { pat?: string; password?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.connectionTest, config),
  verifyConnection: () => ipcRenderer.invoke(IPC_CHANNELS.connectionVerify),
  listCollections: (creds) => ipcRenderer.invoke(IPC_CHANNELS.connectionListCollections, creds),
  listProjects: (creds) => ipcRenderer.invoke(IPC_CHANNELS.connectionListProjects, creds),
  listTeams: (creds) => ipcRenderer.invoke(IPC_CHANNELS.connectionListTeams, creds),
  listWorkItems: (query?: string) => ipcRenderer.invoke(IPC_CHANNELS.workItemsList, query),
  getWorkItem: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.workItemsGet, id),
  createWorkItem: (input: CreateWorkItemInput) => ipcRenderer.invoke(IPC_CHANNELS.workItemsCreate, input),
  updateWorkItem: (input: PatchWorkItemInput) => ipcRenderer.invoke(IPC_CHANNELS.workItemsUpdate, input),
  moveWorkItem: (id: number, column: string, rev: number, state?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.workItemsMove, id, column, rev, state),
  getComments: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.workItemsComments, id),
  addComment: (input) => ipcRenderer.invoke(IPC_CHANNELS.workItemsAddComment, input),
  uploadAttachment: (id: number, file: AttachmentUpload) =>
    ipcRenderer.invoke(IPC_CHANNELS.workItemsUploadAttachment, id, file),
  removeAttachment: (id: number, attachmentUrl: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.workItemsRemoveAttachment, id, attachmentUrl),
  fetchMedia: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.mediaFetch, url),
  getBoardColumns: () => ipcRenderer.invoke(IPC_CHANNELS.boardColumns),
  getWorkItemTypes: () => ipcRenderer.invoke(IPC_CHANNELS.workItemTypes),
  listAssignees: () => ipcRenderer.invoke(IPC_CHANNELS.assigneesList),
  searchAssignees: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.assigneesSearch, query),
  getCurrentUser: () => ipcRenderer.invoke(IPC_CHANNELS.currentUser),
  listAreaPaths: () => ipcRenderer.invoke(IPC_CHANNELS.areaPaths),
  listIterationPaths: () => ipcRenderer.invoke(IPC_CHANNELS.iterationPaths),
  listViews: () => ipcRenderer.invoke(IPC_CHANNELS.viewsList),
  saveView: (view: SavedView) => ipcRenderer.invoke(IPC_CHANNELS.viewsSave, view),
  deleteView: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.viewsDelete, id),
  getSyncStatus: () => ipcRenderer.invoke(IPC_CHANNELS.syncStatus),
  showWindow: () => ipcRenderer.invoke(IPC_CHANNELS.windowShow),
  hideWindow: () => ipcRenderer.invoke(IPC_CHANNELS.windowHide),
  quitApp: () => ipcRenderer.invoke(IPC_CHANNELS.appQuit),
  getAutoLaunch: () => ipcRenderer.invoke(IPC_CHANNELS.autoLaunchGet),
  setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.autoLaunchSet, enabled),
  readClipboardImage: () => ipcRenderer.invoke(IPC_CHANNELS.clipboardReadImage),
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.openExternal, url),
  onShowQuickCreate: (cb) => subscribe(IPC_CHANNELS.eventShowQuickCreate, cb),
  onShowCommandPalette: (cb) => subscribe(IPC_CHANNELS.eventShowCommandPalette, cb),
  onNavigate: (cb) => subscribe(IPC_CHANNELS.eventNavigate, cb),
  onSyncStatus: (cb) => subscribe(IPC_CHANNELS.eventSyncStatus, cb),
}

contextBridge.exposeInMainWorld('azureFastBoard', api)
