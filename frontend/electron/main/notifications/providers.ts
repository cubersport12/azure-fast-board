import { Notification } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipc'
import type { BoardNotification, NotificationSettings } from '../../../shared/types'
import { loadMattermostWebhookUrl, loadSmtpPassword } from '../credentials'
import { applyInsecureTls, azureFetch } from '../azure/http'
import { getMattermostConfigured, postMattermostToSelf } from '../mattermost/client'
import { clearTaskbarAttention, requestTaskbarAttention } from './attention'
import {
  formatWindowsNotification,
  healNotificationIds,
  notificationOpenRoute,
} from './format'
import { sendSmtpMail } from './smtp'

export interface ProviderContext {
  getMainWindow: () => Electron.BrowserWindow | null
  insecureTls: boolean
}

/** Keep toast instances alive so click handlers are not GC'd by V8. */
const liveToasts = new Set<Notification>()

export async function deliverToProviders(
  notification: BoardNotification,
  settings: NotificationSettings,
  ctx: ProviderContext,
) {
  const tasks: Promise<void>[] = []

  if (settings.providers.app.enabled) {
    tasks.push(deliverApp(notification, settings, ctx))
  }
  if (settings.providers.mattermost.enabled) {
    tasks.push(deliverMattermost(notification, ctx))
  }
  if (settings.providers.email.enabled) {
    tasks.push(deliverEmail(notification, settings, ctx))
  }

  const results = await Promise.allSettled(tasks)
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[notifications]', result.reason)
    }
  }
}

function openFromNotification(notification: BoardNotification, ctx: ProviderContext) {
  const route = notificationOpenRoute(healNotificationIds(notification))
  // Deleted (and other non-openable) — do nothing on click.
  if (!route) {
    console.log('[notifications] toast click ignored — no open route')
    return
  }

  const win = ctx.getMainWindow()
  if (!win || win.isDestroyed()) {
    console.warn('[notifications] toast click — main window missing')
    return
  }

  clearTaskbarAttention(win)
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()

  // Navigate after the window is shown; HashRouter listens via eventNavigate.
  const send = () => {
    if (win.isDestroyed()) return
    console.log(`[notifications] navigate ${route}`)
    win.webContents.send(IPC_CHANNELS.eventNavigate, route)
  }
  setTimeout(send, 50)
  setTimeout(send, 250)
}

async function deliverApp(
  notification: BoardNotification,
  settings: NotificationSettings,
  ctx: ProviderContext,
) {
  const win = ctx.getMainWindow()
  if (settings.providers.app.flashTaskbar) {
    requestTaskbarAttention(win)
  }

  if (notification.read) return

  if (settings.providers.app.showToast && Notification.isSupported()) {
    const { title, body } = formatWindowsNotification(notification)
    const toast = new Notification({
      title,
      body,
      silent: false,
      timeoutType: 'default',
    })
    liveToasts.add(toast)
    toast.on('click', () => openFromNotification(notification, ctx))
    toast.on('close', () => {
      liveToasts.delete(toast)
    })
    toast.show()
  }
}

async function deliverMattermost(notification: BoardNotification, ctx: ProviderContext) {
  const { title, body } = formatWindowsNotification(notification)
  const text = `**${title}**\n${body}`

  if (getMattermostConfigured()) {
    await postMattermostToSelf(text)
    return
  }

  // Legacy webhook (if still stored).
  const webhookUrl = loadMattermostWebhookUrl()
  if (!webhookUrl) {
    throw new Error('Mattermost не настроен (логин/пароль)')
  }
  if (ctx.insecureTls) applyInsecureTls(true)

  const response = await azureFetch(
    webhookUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        username: 'Azure Fast Board',
      }),
    },
    { preferNode: true, insecureTls: ctx.insecureTls },
  )

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`Mattermost webhook failed: HTTP ${response.status} ${details.slice(0, 200)}`)
  }
}

async function deliverEmail(
  notification: BoardNotification,
  settings: NotificationSettings,
  ctx: ProviderContext,
) {
  const email = settings.providers.email
  if (!email.to.trim() || !email.smtpHost.trim()) {
    throw new Error('Email provider is not fully configured')
  }
  const password = loadSmtpPassword() || undefined
  const { title, body } = formatWindowsNotification(notification)
  await sendSmtpMail({
    host: email.smtpHost,
    port: email.smtpPort || 587,
    secure: email.smtpSecure,
    user: email.smtpUser || undefined,
    password,
    from: email.smtpUser || 'azure-fast-board@localhost',
    to: email.to,
    subject: title,
    text: body,
  })
  void ctx
}
