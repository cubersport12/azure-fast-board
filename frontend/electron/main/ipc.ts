import { clipboard, ipcMain, nativeImage, shell, app } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc'
import type {
  AddCommentInput,
  AttachmentUpload,
  ConnectionConfig,
  CreateWorkItemInput,
  PatchWorkItemInput,
  SavedView,
  ServiceHookCreateInput,
  SyncStatus,
  WorkItemDetail,
} from '../../shared/types'
import { AzureClient } from './azure/client'
import { applyInsecureTls } from './azure/http'
import {
  clearSecrets,
  loadMattermostPassword,
  loadPassword,
  loadPat,
  saveMattermostPassword,
  saveMattermostWebhookUrl,
  savePassword,
  savePat,
  saveSmtpPassword,
  saveNotificationsApiToken,
} from './credentials'
import { toIpcError } from './ipc-error'
import {
  connectMattermostAndPingSelf,
  getMattermostConfigured,
  listMattermostChannels,
  listMattermostTeams,
  notifyWorkItemCreatedToMattermostIfEnabled,
  getMattermostUsersByIds,
  searchMattermostUsers,
  shareWorkItemToMattermost,
} from './mattermost/client'
import { NotificationService } from './notifications'
import {
  clearConnection,
  deleteView,
  getCachedWorkItems,
  getConnection,
  getSettings,
  getViews,
  saveConnection,
  saveView,
  setCachedWorkItems,
  updateSettings,
} from './store'

let notificationService: NotificationService | null = null

export function getNotificationService() {
  return notificationService
}

let syncStatus: SyncStatus = { state: 'idle' }

function emitStatus(sender?: Electron.WebContents) {
  if (sender && !sender.isDestroyed()) {
    sender.send(IPC_CHANNELS.eventSyncStatus, syncStatus)
  }
}

function setStatus(next: SyncStatus, sender?: Electron.WebContents) {
  syncStatus = next
  emitStatus(sender)
}

function getClient() {
  const connection = getConnection()
  if (!connection) return null
  const authMethod = connection.authMethod || 'pat'
  const pat = loadPat()
  const password = loadPassword()
  if (authMethod === 'password') {
    if (!password || !connection.username) return null
    return new AzureClient({
      connection,
      password,
      username: connection.username,
      insecureTls: getSettings().insecureTls,
    })
  }
  if (!pat) return null
  return new AzureClient({
    connection,
    pat,
    username: connection.username,
    insecureTls: getSettings().insecureTls,
  })
}

function requireClient() {
  const client = getClient()
  if (!client) {
    throw new Error('Подключение к Azure DevOps Server не настроено')
  }
  return client
}

function columnStateFallback(column: string) {
  const lower = column.toLowerCase()
  if (lower.includes('done') || lower.includes('closed')) return 'Closed'
  if (lower.includes('resolve')) return 'Resolved'
  if (lower.includes('active') || lower.includes('progress')) return 'Active'
  return 'New'
}

function normalizeServerUrl(value: string) {
  let url = value.trim().replace(/\/+$/, '')
  // Allow pasting a project URL; keep only origin (+ optional /tfs)
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts[0]?.toLowerCase() === 'tfs') {
      url = `${parsed.origin}/tfs`
    } else if (
      parsed.hostname.includes('dev.azure.com') ||
      parsed.hostname.includes('visualstudio.com')
    ) {
      url = parsed.origin
    } else if (parts.length > 0 && !parts[0].startsWith('_')) {
      // https://server/DefaultCollection/... → keep host only; collection is selected separately
      // unless first segment is literally tfs (handled above)
      url = parsed.origin
    } else {
      url = parsed.origin
    }
  } catch {
    // keep trimmed raw value
  }
  return url
}

function withTls() {
  const settings = getSettings()
  if (settings.insecureTls) applyInsecureTls(true)
  return settings.insecureTls
}

export function registerIpcHandlers(getMainWindow: () => Electron.BrowserWindow | null) {
  withTls()

  notificationService = new NotificationService(getClient, getMainWindow)
  notificationService.start()

  ipcMain.handle(IPC_CHANNELS.debugLog, (_e, message: string, data?: unknown) => {
    if (data !== undefined) console.log(String(message || ''), data)
    else console.log(String(message || ''))
  })

  ipcMain.handle(IPC_CHANNELS.settingsGet, () => getSettings())
  ipcMain.handle(IPC_CHANNELS.settingsUpdate, (_e, patch) => {
    const previous = getSettings()
    const next = updateSettings(patch)
    if (next.insecureTls) applyInsecureTls(true)
    // Theme/filters/sprint must not bounce the WebSocket.
    notificationService?.restartIfNeeded(previous, next)
    return next
  })

  ipcMain.handle(IPC_CHANNELS.connectionGet, () => getConnection())
  ipcMain.handle(
    IPC_CHANNELS.connectionSave,
    (_e, config: ConnectionConfig & { pat?: string; password?: string }) => {
      const { pat, password, ...rest } = config
      const authMethod = rest.authMethod || (password ? 'password' : 'pat')
      if (authMethod === 'password') {
        if (!rest.username?.trim()) {
          throw new Error('Username is required')
        }
        if (password?.trim()) {
          savePassword(password.trim())
        } else if (!loadPassword()) {
          throw new Error('Username and password are required')
        }
      } else {
        if (pat?.trim()) {
          savePat(pat.trim())
        } else if (!loadPat()) {
          throw new Error('PAT is required')
        }
      }
      const saved = saveConnection({
        ...rest,
        authMethod,
        serverUrl: normalizeServerUrl(rest.serverUrl),
        username: rest.username?.trim() || undefined,
      })
      notificationService?.resetSnapshot()
      notificationService?.restart()
      return saved
    },
  )
  ipcMain.handle(IPC_CHANNELS.connectionClear, () => {
    clearSecrets()
    clearConnection()
    notificationService?.resetSnapshot()
    notificationService?.stop()
  })
  ipcMain.handle(IPC_CHANNELS.connectionVerify, async () => {
    try {
      const client = requireClient()
      await client.listProjects()
      return { ok: true as const, message: 'Подключение активно' }
    } catch (error) {
      throw toIpcError(error)
    }
  })
  ipcMain.handle(
    IPC_CHANNELS.connectionTest,
    async (_e, config: ConnectionConfig & { pat?: string; password?: string }) => {
      const client = new AzureClient({
        connection: config,
        pat: config.pat,
        password: config.password,
        username: config.username,
        insecureTls: getSettings().insecureTls,
      })
      return client.testConnection()
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.connectionListCollections,
    async (
      _e,
      creds: {
        serverUrl: string
        pat?: string
        password?: string
        apiVersion?: string
        insecureTls?: boolean
        username?: string
        authMethod?: 'pat' | 'password'
      },
    ) => {
      try {
        const insecureTls = Boolean(creds.insecureTls ?? withTls())
        if (insecureTls) applyInsecureTls(true)
        const authMethod = creds.authMethod || (creds.password ? 'password' : getConnection()?.authMethod) || 'password'
        const password = creds.password || loadPassword() || undefined
        const pat = creds.pat || loadPat() || undefined
        const client = new AzureClient({
          connection: {
            serverUrl: normalizeServerUrl(creds.serverUrl),
            collection: '',
            project: '',
            team: '',
            apiVersion: creds.apiVersion || '7.0',
            username: creds.username?.trim() || undefined,
            authMethod,
          },
          pat,
          password,
          username: creds.username,
          insecureTls,
        })
        return await client.listCollections()
      } catch (error) {
        throw toIpcError(error)
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.connectionListProjects,
    async (
      _e,
      creds: {
        serverUrl: string
        pat?: string
        password?: string
        collection: string
        apiVersion?: string
        insecureTls?: boolean
        username?: string
        authMethod?: 'pat' | 'password'
      },
    ) => {
      try {
        const insecureTls = Boolean(creds.insecureTls ?? withTls())
        if (insecureTls) applyInsecureTls(true)
        const authMethod = creds.authMethod || (creds.password ? 'password' : getConnection()?.authMethod) || 'password'
        const password = creds.password || loadPassword() || undefined
        const pat = creds.pat || loadPat() || undefined
        const client = new AzureClient({
          connection: {
            serverUrl: normalizeServerUrl(creds.serverUrl),
            collection: creds.collection,
            project: '',
            team: '',
            apiVersion: creds.apiVersion || '7.0',
            username: creds.username?.trim() || undefined,
            authMethod,
          },
          pat,
          password,
          username: creds.username,
          insecureTls,
        })
        return await client.listProjects()
      } catch (error) {
        throw toIpcError(error)
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.connectionListTeams,
    async (
      _e,
      creds: {
        serverUrl: string
        pat?: string
        password?: string
        collection: string
        project: string
        apiVersion?: string
        insecureTls?: boolean
        username?: string
        authMethod?: 'pat' | 'password'
      },
    ) => {
      try {
        const insecureTls = Boolean(creds.insecureTls ?? withTls())
        if (insecureTls) applyInsecureTls(true)
        const authMethod = creds.authMethod || (creds.password ? 'password' : getConnection()?.authMethod) || 'password'
        const password = creds.password || loadPassword() || undefined
        const pat = creds.pat || loadPat() || undefined
        const client = new AzureClient({
          connection: {
            serverUrl: normalizeServerUrl(creds.serverUrl),
            collection: creds.collection,
            project: creds.project,
            team: '',
            apiVersion: creds.apiVersion || '7.0',
            username: creds.username?.trim() || undefined,
            authMethod,
          },
          pat,
          password,
          username: creds.username,
          insecureTls,
        })
        return await client.listTeams()
      } catch (error) {
        throw toIpcError(error)
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.workItemsList, async (event, query?: string) => {
    const client = requireClient()
    setStatus({ state: 'syncing', message: 'Синхронизация рабочих элементов…' }, event.sender)
    try {
      const items = await client.listWorkItems(query)
      setCachedWorkItems(items)
      setStatus({
        state: 'idle',
        message: 'Синхронизировано',
        itemCount: items.length,
        lastSyncedAt: new Date().toISOString(),
      }, event.sender)
      return items
    } catch (error) {
      const cached = getCachedWorkItems()
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Ошибка синхронизации',
        itemCount: cached.workItems.length,
        lastSyncedAt: cached.updatedAt,
      }, event.sender)
      if (cached.workItems.length) return cached.workItems
      throw error
    }
  })

  ipcMain.handle(IPC_CHANNELS.workItemsGet, async (_e, id: number): Promise<WorkItemDetail> => {
    return requireClient().getWorkItem(id)
  })

  ipcMain.handle(IPC_CHANNELS.workItemsCreate, async (_e, input: CreateWorkItemInput) => {
    const { attachments = [], ...fields } = input
    const client = requireClient()
    const created = await client.createWorkItem(fields)
    notificationService?.noteSelfAction(created.id)
    for (const file of attachments) {
      await client.uploadAttachment(created.id, file)
    }
    // Auto MM notify (self DM) when enabled in settings — don't block create on MM errors.
    void client
      .getWorkItem(created.id)
      .then((detail) =>
        notifyWorkItemCreatedToMattermostIfEnabled(detail, (url) => client.downloadMedia(url)),
      )
      .catch((error) => console.warn('[mattermost] notify on create skipped:', error))
    return created
  })

  ipcMain.handle(IPC_CHANNELS.workItemsUpdate, async (_e, input: PatchWorkItemInput) => {
    const updated = await requireClient().updateWorkItem(input)
    notificationService?.noteSelfAction(updated.id)
    return updated
  })

  ipcMain.handle(
    IPC_CHANNELS.workItemsMove,
    async (_e, id: number, column: string, rev: number, state?: string) => {
      const client = requireClient()
      const preferred = state?.trim() || column.trim()
      try {
        const moved = await client.moveWorkItem(id, column, rev, preferred)
        notificationService?.noteSelfAction(moved.id)
        return moved
      } catch (error) {
        const fallback = columnStateFallback(column)
        if (fallback && fallback !== preferred) {
          const moved = await client.moveWorkItem(id, column, rev, fallback)
          notificationService?.noteSelfAction(moved.id)
          return moved
        }
        throw error
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.workItemsComments, async (_e, id: number) => {
    return requireClient().getComments(id)
  })

  ipcMain.handle(IPC_CHANNELS.workItemsAddComment, async (_e, input: AddCommentInput) => {
    const { id, text } = input
    const body = String(text || '').trim()
    if (!body) throw new Error('Comment is empty')
    notificationService?.noteSelfAction(id)
    // Images are uploaded in the renderer and already inlined as <img> in HTML.
    return requireClient().addComment(id, body)
  })

  ipcMain.handle(IPC_CHANNELS.workItemsUploadAttachment, async (_e, id: number, file: AttachmentUpload) => {
    notificationService?.noteSelfAction(id)
    return requireClient().uploadAttachment(id, file)
  })

  ipcMain.handle(
    IPC_CHANNELS.workItemsRemoveAttachment,
    async (_e, id: number, attachmentUrl: string) => {
      return requireClient().removeAttachment(id, attachmentUrl)
    },
  )

  ipcMain.handle(IPC_CHANNELS.mediaFetch, async (_e, url: string) => {
    if (typeof url !== 'string' || !url.trim()) throw new Error('Media URL is required')
    if (url.startsWith('data:')) {
      const match = /^data:([^;,]+)?(?:;base64)?,([\s\S]*)$/i.exec(url)
      if (!match) throw new Error('Invalid data URL')
      return { mimeType: match[1] || 'image/png', dataBase64: match[2] || '' }
    }
    return requireClient().downloadMedia(url)
  })

  ipcMain.handle(IPC_CHANNELS.boardColumns, async () => requireClient().getBoardColumns())
  ipcMain.handle(IPC_CHANNELS.workItemTypes, async () => requireClient().getWorkItemTypes())
  ipcMain.handle(IPC_CHANNELS.assigneesList, async () => requireClient().listAssignees())
  ipcMain.handle(IPC_CHANNELS.currentUser, async () => {
    try {
      return await requireClient().getCurrentUser()
    } catch (error) {
      throw toIpcError(error)
    }
  })
  ipcMain.handle(IPC_CHANNELS.assigneesSearch, async (_e, query: string) =>
    requireClient().searchAssignees(String(query || '')),
  )
  ipcMain.handle(IPC_CHANNELS.areaPaths, async () => {
    try {
      return await requireClient().listAreaPaths()
    } catch (error) {
      throw toIpcError(error)
    }
  })
  ipcMain.handle(IPC_CHANNELS.iterationPaths, async () => {
    try {
      return await requireClient().listIterationPaths()
    } catch (error) {
      throw toIpcError(error)
    }
  })
  ipcMain.handle(IPC_CHANNELS.renameIteration, async (_e, path: string, newName: string) => {
    try {
      return await requireClient().renameIteration(String(path || ''), String(newName || ''))
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.viewsList, () => getViews())
  ipcMain.handle(IPC_CHANNELS.viewsSave, (_e, view: SavedView) => saveView(view))
  ipcMain.handle(IPC_CHANNELS.viewsDelete, (_e, id: string) => deleteView(id))
  ipcMain.handle(IPC_CHANNELS.syncStatus, () => syncStatus)

  ipcMain.handle(IPC_CHANNELS.windowShow, () => {
    const win = getMainWindow()
    if (!win) return
    win.show()
    win.focus()
  })
  ipcMain.handle(IPC_CHANNELS.windowHide, () => {
    getMainWindow()?.hide()
  })
  ipcMain.handle(IPC_CHANNELS.appQuit, () => {
    app.quit()
  })
  ipcMain.handle(IPC_CHANNELS.autoLaunchGet, () => {
    return app.getLoginItemSettings().openAtLogin
  })
  ipcMain.handle(IPC_CHANNELS.autoLaunchSet, (_e, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true })
    return enabled
  })

  ipcMain.handle(IPC_CHANNELS.clipboardReadImage, (): AttachmentUpload | null => {
    const image = clipboard.readImage()
    if (image.isEmpty()) return null
    const png = image.toPNG()
    return {
      fileName: `screenshot-${Date.now()}.png`,
      mimeType: 'image/png',
      dataBase64: png.toString('base64'),
    }
  })

  ipcMain.handle(IPC_CHANNELS.openExternal, (_e, url: string) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('data:')) {
      return shell.openExternal(url)
    }
  })

  ipcMain.handle(IPC_CHANNELS.serviceHooksList, async () => {
    try {
      return await requireClient().listServiceHooks()
    } catch (error) {
      throw toIpcError(error)
    }
  })
  ipcMain.handle(IPC_CHANNELS.serviceHooksGet, async (_e, id: string) => {
    try {
      return await requireClient().getServiceHook(String(id || ''))
    } catch (error) {
      throw toIpcError(error)
    }
  })
  ipcMain.handle(IPC_CHANNELS.serviceHooksCreate, async (_e, input: ServiceHookCreateInput) => {
    try {
      return await requireClient().createServiceHook(input)
    } catch (error) {
      throw toIpcError(error)
    }
  })
  ipcMain.handle(IPC_CHANNELS.serviceHooksDelete, async (_e, id: string) => {
    try {
      await requireClient().deleteServiceHook(String(id || ''))
    } catch (error) {
      throw toIpcError(error)
    }
  })
  ipcMain.handle(IPC_CHANNELS.serviceHooksTest, async (_e, id: string) => {
    try {
      return await requireClient().testServiceHook(String(id || ''))
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.notificationsSecretsSet,
    (
      _e,
      secrets: {
        mattermostWebhookUrl?: string | null
        mattermostPassword?: string | null
        smtpPassword?: string | null
        notificationsApiToken?: string | null
      },
    ) => {
      if (secrets.mattermostWebhookUrl !== undefined) {
        saveMattermostWebhookUrl(secrets.mattermostWebhookUrl)
      }
      if (secrets.mattermostPassword !== undefined) {
        saveMattermostPassword(secrets.mattermostPassword)
      }
      if (secrets.smtpPassword !== undefined) {
        saveSmtpPassword(secrets.smtpPassword)
      }
      if (secrets.notificationsApiToken !== undefined) {
        saveNotificationsApiToken(secrets.notificationsApiToken)
      }
      notificationService?.restart()
      return getSettings()
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.mattermostConnect,
    async (
      _e,
      input: { baseUrl?: string; loginId?: string; password?: string },
    ) => {
      try {
        const settings = getSettings()
        const baseUrl = String(input?.baseUrl || settings.notifications.providers.mattermost.baseUrl || '').trim()
        const loginId = String(input?.loginId || settings.notifications.providers.mattermost.loginId || '').trim()
        const typedPassword = String(input?.password || '')
        if (typedPassword) {
          saveMattermostPassword(typedPassword)
        }
        const password = typedPassword || loadMattermostPassword() || ''
        updateSettings({
          notifications: {
            ...settings.notifications,
            providers: {
              ...settings.notifications.providers,
              mattermost: {
                ...settings.notifications.providers.mattermost,
                baseUrl,
                loginId,
              },
            },
          },
        })
        return await connectMattermostAndPingSelf({
          baseUrl,
          loginId,
          password,
          insecureTls: settings.insecureTls,
        })
      } catch (error) {
        throw toIpcError(error)
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.mattermostConfigured, () => getMattermostConfigured())

  ipcMain.handle(IPC_CHANNELS.mattermostListTeams, async () => {
    try {
      return await listMattermostTeams()
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.mattermostListChannels, async (_e, teamId: string) => {
    try {
      return await listMattermostChannels(String(teamId || ''))
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.mattermostSearchUsers, async (_e, term: string) => {
    try {
      return await searchMattermostUsers(String(term || ''))
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.mattermostUsersByIds, async (_e, ids: string[]) => {
    try {
      return await getMattermostUsersByIds(Array.isArray(ids) ? ids.map(String) : [])
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.mattermostShareWorkItem,
    async (
      _e,
      input: {
        workItemId?: number
        mode?: 'channel' | 'user'
        teamId?: string
        channelId?: string
        userId?: string
      },
    ) => {
      try {
        const workItemId = Number(input?.workItemId)
        if (!Number.isFinite(workItemId) || workItemId <= 0) {
          return { ok: false, message: 'Некорректный work item' }
        }
        const detail = await requireClient().getWorkItem(workItemId)
        const mode = input?.mode === 'user' ? 'user' : 'channel'
        const target =
          mode === 'user'
            ? ({ mode: 'user', userId: String(input?.userId || '') } as const)
            : ({
                mode: 'channel',
                teamId: String(input?.teamId || ''),
                channelId: String(input?.channelId || ''),
              } as const)
        return await shareWorkItemToMattermost(detail, target, (url) =>
          requireClient().downloadMedia(url),
        )
      } catch (error) {
        throw toIpcError(error)
      }
    },
  )
  ipcMain.handle(IPC_CHANNELS.notificationsHistory, () => notificationService?.getHistory() ?? [])
  ipcMain.handle(IPC_CHANNELS.notificationsMarkRead, (_e, id: string) =>
    notificationService?.markRead(String(id || '')) ?? [],
  )
  ipcMain.handle(IPC_CHANNELS.notificationsMarkReadByWorkItem, (_e, workItemId: number) =>
    notificationService?.markReadByWorkItemId(Number(workItemId)) ?? [],
  )
  ipcMain.handle(IPC_CHANNELS.notificationsMarkAllRead, () =>
    notificationService?.markAllRead() ?? [],
  )
  ipcMain.handle(IPC_CHANNELS.notificationsClear, () => notificationService?.clearHistory() ?? [])
  ipcMain.handle(IPC_CHANNELS.notificationsTest, async () => {
    try {
      if (!notificationService) throw new Error('Notification service is not ready')
      return await notificationService.test()
    } catch (error) {
      throw toIpcError(error)
    }
  })

  // Keep nativeImage referenced for future tray icon generation helpers.
  void nativeImage
}
