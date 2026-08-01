import { Notification } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipc'
import type { BoardNotification, NotificationSettings } from '../../../shared/types'
import { loadMattermostWebhookUrl, loadSmtpPassword } from '../credentials'
import { applyInsecureTls, azureFetch } from '../azure/http'
import { clearTaskbarAttention, requestTaskbarAttention } from './attention'
import { formatWindowsNotification, notificationOpenRoute } from './format'
import { sendSmtpMail } from './smtp'

export interface ProviderContext {
  getMainWindow: () => Electron.BrowserWindow | null
  insecureTls: boolean
}

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
  const route = notificationOpenRoute(notification)
  // Deleted (and other non-openable) — do nothing on click.
  if (!route) return

  const win = ctx.getMainWindow()
  if (!win || win.isDestroyed()) return

  clearTaskbarAttention(win)
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
  win.webContents.send(IPC_CHANNELS.eventNavigate, route)
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

  // History replay should not spam Action Center.
  if (notification.read) return

  if (settings.providers.app.showToast && Notification.isSupported()) {
    const { title, body } = formatWindowsNotification(notification)
    const toast = new Notification({
      title,
      body,
      silent: false,
      timeoutType: 'default',
    })
    toast.on('click', () => openFromNotification(notification, ctx))
    toast.show()
  }
}

async function deliverMattermost(notification: BoardNotification, ctx: ProviderContext) {
  const webhookUrl = loadMattermostWebhookUrl()
  if (!webhookUrl) {
    throw new Error('Mattermost webhook URL is not configured')
  }
  if (ctx.insecureTls) applyInsecureTls(true)

  const { title, body } = formatWindowsNotification(notification)
  const text = `**${title}**\n${body}`
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
