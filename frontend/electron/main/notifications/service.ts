import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS } from '../../../shared/ipc'
import type { BoardNotification, NotificationEventType, WorkItem } from '../../../shared/types'
import type { AzureClient } from '../azure/client'
import {
  getConnection,
  getNotificationHistory,
  getSettings,
  saveNotificationHistory,
} from '../store'
import { clearTaskbarAttention } from './attention'
import { diffWorkItems } from './diff'
import {
  extractWorkItemIdFromText,
  healNotificationIds,
  notificationBelongsToWorkItem,
} from './format'
import { anyIdentityMatch } from './identity'
import { deliverToProviders } from './providers'
import { NotificationsWsClient, type RealtimeBoardEvent } from './ws-client'

/** True when event assignee matches current user. Missing assignee → unknown (null). */
function isEventAssignedToMe(
  event: RealtimeBoardEvent,
  uniqueName?: string,
  displayName?: string,
): boolean | null {
  const mine = [uniqueName, displayName]
  const theirs = [event.assignedToUniqueName, event.assignedTo]
  if (!mine.some((value) => value?.trim())) return null
  if (!theirs.some((value) => value?.trim())) return null
  return anyIdentityMatch(mine, theirs)
}

const SELF_ACTION_TTL_MS = 2 * 60_000

export class NotificationService {
  private timer: NodeJS.Timeout | null = null
  private snapshot: WorkItem[] | null = null
  private currentUserUniqueName?: string
  private currentUserDisplayName?: string
  private currentProjectId?: string
  private history: BoardNotification[] = []
  private running = false
  private ws = new NotificationsWsClient()
  private wsConnected = false
  private seenEventIds = new Set<string>()
  /** Work item ids recently changed by this app — hub events for them are auto-read. */
  private recentSelfActions = new Map<number, number>()

  constructor(
    private readonly getClient: () => AzureClient | null,
    private readonly getMainWindow: () => Electron.BrowserWindow | null,
  ) {
    this.history = getNotificationHistory().map(healNotificationIds)
    this.persistHistory()
    for (const item of this.history) {
      if (item.id) this.seenEventIds.add(item.id)
    }
  }

  /** Call after local create/update/move/comment so hub echoes don't toast. */
  noteSelfAction(workItemId: number) {
    if (!Number.isFinite(workItemId) || workItemId <= 0) return
    const now = Date.now()
    this.recentSelfActions.set(workItemId, now)
    for (const [id, at] of this.recentSelfActions) {
      if (now - at > SELF_ACTION_TTL_MS) this.recentSelfActions.delete(id)
    }
  }

  private isRecentSelfAction(workItemId?: number | null) {
    if (!workItemId || !Number.isFinite(workItemId)) return false
    const at = this.recentSelfActions.get(workItemId)
    if (!at) return false
    if (Date.now() - at > SELF_ACTION_TTL_MS) {
      this.recentSelfActions.delete(workItemId)
      return false
    }
    return true
  }

  private historyLimit() {
    return Math.max(1, getSettings().notifications.maxCached || 100)
  }

  private persistHistory() {
    this.history = saveNotificationHistory(this.history)
  }

  private bootstrapGen = 0

  start() {
    this.stop()
    this.history = getNotificationHistory().map(healNotificationIds)
    const settings = getSettings()
    if (!settings.notifications.enabled) return

    this.running = true
    void this.bootstrapRealtime(settings.notifications.apiUrl)

    // Poll is fallback when WebSocket is unavailable / not configured.
    const tick = () => {
      void this.poll()
    }
    tick()
    const interval = Math.max(10_000, settings.pollIntervalMs || 30_000)
    this.timer = setInterval(tick, interval)
  }

  private async bootstrapRealtime(apiUrl: string) {
    const gen = ++this.bootstrapGen
    const client = this.getClient()
    if (client) {
      await this.ensureIdentity(client)
      await this.ensureProjectId(client)
    }
    // A newer start/restart superseded this bootstrap.
    if (gen !== this.bootstrapGen || !this.running) return

    const trimmed = apiUrl.trim()
    if (trimmed && this.ws.matches(trimmed, this.currentProjectId)) {
      this.wsConnected = true
      return
    }

    this.ws.configure({
      apiUrl: trimmed,
      projectId: this.currentProjectId,
      onEvent: (event) => {
        void this.handleRealtimeEvent(event)
      },
      onHistory: (events) => {
        void (async () => {
          for (const event of events) {
            await this.handleRealtimeEvent(event, { fromHistory: true })
          }
        })()
      },
      onStatus: (status) => {
        this.wsConnected = status.connected
      },
    })

    if (trimmed) {
      this.ws.start()
    }
  }

  stop() {
    this.bootstrapGen += 1
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.running = false
    this.ws.stop()
    this.wsConnected = false
  }

  restart() {
    this.start()
  }

  /** Restart only when notification transport settings actually changed. */
  restartIfNeeded(previous: ReturnType<typeof getSettings>, next: ReturnType<typeof getSettings>) {
    const prevN = previous.notifications
    const nextN = next.notifications
    const changed =
      prevN.enabled !== nextN.enabled ||
      prevN.apiUrl.trim() !== nextN.apiUrl.trim() ||
      prevN.onlyAssignedToMe !== nextN.onlyAssignedToMe ||
      prevN.maxCached !== nextN.maxCached ||
      JSON.stringify(prevN.events) !== JSON.stringify(nextN.events) ||
      JSON.stringify(prevN.providers.app) !== JSON.stringify(nextN.providers.app) ||
      prevN.providers.mattermost.enabled !== nextN.providers.mattermost.enabled ||
      prevN.providers.mattermost.baseUrl !== nextN.providers.mattermost.baseUrl ||
      prevN.providers.mattermost.loginId !== nextN.providers.mattermost.loginId ||
      previous.pollIntervalMs !== next.pollIntervalMs ||
      previous.insecureTls !== next.insecureTls
    if (changed) this.restart()
  }

  getHistory() {
    return [...this.history]
  }

  markRead(id: string) {
    let changed = false
    this.history = this.history.map((item) => {
      if (item.id !== id || item.read) return item
      changed = true
      return { ...item, read: true }
    })
    if (changed) this.persistHistory()
    return this.getHistory()
  }

  /** Mark all notifications for a work item as read (user opened the card). */
  markReadByWorkItemId(workItemId: number) {
    if (!Number.isFinite(workItemId) || workItemId <= 0) return this.getHistory()
    let changed = false
    this.history = this.history.map((item) => {
      const healed = healNotificationIds(item)
      if (!notificationBelongsToWorkItem(healed, workItemId)) {
        return healed === item ? item : healed
      }
      if (healed.read && healed.workItemId === item.workItemId && healed.commentId === item.commentId) {
        return item
      }
      changed = true
      return { ...healed, read: true }
    })
    if (changed) this.persistHistory()
    return this.getHistory()
  }

  markAllRead() {
    this.history = this.history.map((item) => (item.read ? item : { ...item, read: true }))
    this.persistHistory()
    return this.getHistory()
  }

  clearHistory() {
    this.history = []
    this.persistHistory()
    return this.getHistory()
  }

  async test(): Promise<BoardNotification> {
    const notification: BoardNotification = {
      id: randomUUID(),
      eventType: 'workitem.updated',
      title: 'Тест уведомления',
      body: 'Проверка провайдеров Azure Fast Board',
      createdAt: new Date().toISOString(),
      source: 'test',
    }
    await this.dispatch(notification)
    return notification
  }

  private emitToRenderer(notification: BoardNotification) {
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.eventNotification, notification)
    }
  }

  private emitWorkItemsInvalidate(reason: string) {
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.eventWorkItemsInvalidate, { reason })
    }
  }

  private async dispatch(notification: BoardNotification) {
    if (!this.history.some((item) => item.id === notification.id)) {
      this.history = [notification, ...this.history].slice(0, this.historyLimit())
      this.persistHistory()
    }
    this.emitToRenderer(notification)
    const settings = getSettings()
    if (!settings.notifications.enabled) return
    // Disk/history replay should not spam Windows Action Center.
    if (notification.read) return
    await deliverToProviders(notification, settings.notifications, {
      getMainWindow: this.getMainWindow,
      insecureTls: settings.insecureTls,
    })
  }

  private async ensureIdentity(client: AzureClient) {
    if (this.currentUserUniqueName || this.currentUserDisplayName) return
    try {
      const user = await client.getCurrentUser()
      this.currentUserUniqueName = user.uniqueName
      this.currentUserDisplayName = user.displayName
    } catch {
      // continue without user filter identity
    }
  }

  private async ensureProjectId(client: AzureClient) {
    if (this.currentProjectId) return
    try {
      this.currentProjectId = await client.resolveProjectId()
    } catch {
      // optional filter
    }
  }

  private async handleRealtimeEvent(event: RealtimeBoardEvent, options?: { fromHistory?: boolean }) {
    if (this.seenEventIds.has(event.id)) return
    this.seenEventIds.add(event.id)
    if (this.seenEventIds.size > 500) {
      this.seenEventIds = new Set([...this.seenEventIds].slice(-250))
    }

    const settings = getSettings()
    if (!settings.notifications.enabled) return

    const eventTypeRaw = event.eventType.toLowerCase()
    if (
      !options?.fromHistory &&
      (eventTypeRaw === 'workitem.created' || eventTypeRaw === 'workitem.deleted')
    ) {
      this.emitWorkItemsInvalidate(eventTypeRaw)
    }

    const eventType = event.eventType as NotificationEventType
    const enabledMap = settings.notifications.events
    if (eventType in enabledMap && enabledMap[eventType] === false) {
      console.log(
        `[notifications] skip ${eventTypeRaw} #${event.workItemId ?? '-'} — event disabled in settings`,
      )
      return
    }

    if (settings.notifications.onlyAssignedToMe) {
      const mine = isEventAssignedToMe(
        event,
        this.currentUserUniqueName,
        this.currentUserDisplayName,
      )
      // Comment hooks often omit System.AssignedTo — treat missing assignee as unknown and show.
      if (mine === false) {
        console.log(
          `[notifications] skip ${eventTypeRaw} #${event.workItemId ?? '-'} — not assigned to me` +
            ` (event=${event.assignedToUniqueName || event.assignedTo || '∅'}` +
            ` me=${this.currentUserUniqueName || this.currentUserDisplayName || '∅'})`,
        )
        return
      }
    }

    const workItemId = event.workItemId || extractWorkItemIdFromText(event.message)
    const selfInitiated = this.isRecentSelfAction(workItemId)
    const draft = healNotificationIds({
      id: event.id || randomUUID(),
      eventType: event.eventType,
      title:
        event.workItemTitle ||
        event.message ||
        `${event.eventType}${workItemId ? ` #${workItemId}` : ''}`,
      body: event.message || event.workItemTitle || 'Событие доски',
      workItemId: workItemId,
      workItemTitle: event.workItemTitle,
      workItemType: event.workItemType,
      commentId: event.commentId,
      createdAt: event.createdAt || new Date().toISOString(),
      source: 'azure-service-hook',
      // History replay or our own create/update/comment — store as read, no toast.
      read: Boolean(options?.fromHistory) || selfInitiated,
    })

    console.log(
      `[notifications] dispatch ${eventTypeRaw} #${draft.workItemId ?? '-'}` +
        (draft.commentId ? ` commentId=${draft.commentId}` : '') +
        (options?.fromHistory ? ' (history)' : '') +
        (selfInitiated ? ' (self)' : ''),
    )

    await this.dispatch(draft)
  }

  private async poll() {
    if (this.running) return
    const settings = getSettings()
    if (!settings.notifications.enabled) return

    // Prefer notifications-api WebSocket when live.
    if (settings.notifications.apiUrl.trim() && this.wsConnected) return

    const client = this.getClient()
    if (!client) return

    this.running = true
    try {
      await this.ensureIdentity(client)
      await this.ensureProjectId(client)

      const items = await client.listWorkItems()
      if (this.snapshot === null) {
        this.snapshot = items
        return
      }

      const changes = diffWorkItems(this.snapshot, items, {
        onlyAssignedToMe: settings.notifications.onlyAssignedToMe,
        currentUserUniqueName: this.currentUserUniqueName,
        currentUserDisplayName: this.currentUserDisplayName,
        enabledEvents: settings.notifications.events,
      })
      this.snapshot = items

      for (const change of changes) {
        const selfInitiated = this.isRecentSelfAction(change.item.id)
        const notification: BoardNotification = {
          id: randomUUID(),
          eventType: change.eventType,
          title: change.summary,
          body: change.item.title || `Work item #${change.item.id}`,
          workItemId: change.item.id,
          workItemTitle: change.item.title,
          createdAt: new Date().toISOString(),
          source: 'poll',
          read: selfInitiated,
        }
        await this.dispatch(notification)
      }
    } catch (error) {
      console.warn('[notifications] poll failed', error)
    } finally {
      this.running = false
    }
  }

  onWindowFocus() {
    clearTaskbarAttention(this.getMainWindow())
  }

  /** Reset baseline after connection changes so we don't flood with "created". */
  resetSnapshot() {
    this.snapshot = null
    this.currentUserUniqueName = undefined
    this.currentUserDisplayName = undefined
    this.currentProjectId = undefined
    void getConnection()
  }
}
