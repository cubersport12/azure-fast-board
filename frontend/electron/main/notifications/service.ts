import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS } from '../../../shared/ipc'
import type { BoardNotification, WorkItem } from '../../../shared/types'
import type { AzureClient } from '../azure/client'
import { getSettings } from '../store'
import { clearTaskbarAttention } from './attention'
import { diffWorkItems } from './diff'
import { deliverToProviders } from './providers'

const HISTORY_LIMIT = 50

export class NotificationService {
  private timer: NodeJS.Timeout | null = null
  private snapshot: WorkItem[] | null = null
  private currentUserUniqueName?: string
  private currentUserDisplayName?: string
  private history: BoardNotification[] = []
  private running = false

  constructor(
    private readonly getClient: () => AzureClient | null,
    private readonly getMainWindow: () => Electron.BrowserWindow | null,
  ) {}

  start() {
    this.stop()
    const tick = () => {
      void this.poll()
    }
    tick()
    const interval = Math.max(10_000, getSettings().pollIntervalMs || 30_000)
    this.timer = setInterval(tick, interval)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.running = false
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

  private async poll() {
    if (this.running) return
    const settings = getSettings()
    if (!settings.notifications.enabled) return

    const client = this.getClient()
    if (!client) return

    this.running = true
    try {
      if (!this.currentUserUniqueName && !this.currentUserDisplayName) {
        try {
          const user = await client.getCurrentUser()
          this.currentUserUniqueName = user.uniqueName
          this.currentUserDisplayName = user.displayName
        } catch {
          // continue without user filter identity
        }
      }

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
  }
}
