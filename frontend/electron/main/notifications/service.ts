import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS } from '../../../shared/ipc'
import type { BoardNotification, NotificationEventType, WorkItem } from '../../../shared/types'
import type { AzureClient } from '../azure/client'
import { getConnection, getSettings } from '../store'
import { clearTaskbarAttention } from './attention'
import { diffWorkItems } from './diff'
import { formatWindowsNotification } from './format'
import { anyIdentityMatch } from './identity'
import { deliverToProviders } from './providers'
import { NotificationsWsClient, type RealtimeBoardEvent } from './ws-client'

const HISTORY_LIMIT = 50

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

  constructor(
    private readonly getClient: () => AzureClient | null,
    private readonly getMainWindow: () => Electron.BrowserWindow | null,
  ) {}

  start() {
    this.stop()
    const settings = getSettings()
    if (!settings.notifications.enabled) return

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
    const client = this.getClient()
    if (client) {
      await this.ensureIdentity(client)
      await this.ensureProjectId(client)
    }

    this.ws.configure({
      apiUrl,
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
        console.log(`[notifications] realtime ${status.message || (status.connected ? 'up' : 'down')}`)
      },
    })

    if (apiUrl.trim()) {
      this.ws.start()
    } else {
      console.log('[notifications] apiUrl empty — WebSocket disabled, poll fallback only')
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.running = false
    this.ws.stop()
    this.wsConnected = false
  }

  restart() {
    this.start()
  }

  getHistory() {
    return [...this.history]
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
    this.history = [notification, ...this.history].slice(0, HISTORY_LIMIT)
    this.emitToRenderer(notification)
    const settings = getSettings()
    if (!settings.notifications.enabled) return
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

    const draft: BoardNotification = {
      id: event.id || randomUUID(),
      eventType: event.eventType,
      title: '',
      body: event.message || event.workItemTitle || 'Событие доски',
      workItemId: event.workItemId,
      workItemTitle: event.workItemTitle,
      workItemType: event.workItemType,
      commentId: event.commentId,
      createdAt: event.createdAt || new Date().toISOString(),
      source: 'azure-service-hook',
      read: Boolean(options?.fromHistory),
    }
    const formatted = formatWindowsNotification(draft)
    draft.title = formatted.title
    draft.body = formatted.body

    console.log(
      `[notifications] dispatch ${eventTypeRaw} #${event.workItemId ?? '-'}` +
        (event.commentId ? ` commentId=${event.commentId}` : '') +
        (options?.fromHistory ? ' (history)' : ''),
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
        const notification: BoardNotification = {
          id: randomUUID(),
          eventType: change.eventType,
          title: change.summary,
          body: change.item.title || `Work item #${change.item.id}`,
          workItemId: change.item.id,
          workItemTitle: change.item.title,
          createdAt: new Date().toISOString(),
          source: 'poll',
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
