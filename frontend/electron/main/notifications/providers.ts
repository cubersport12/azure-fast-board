import { Notification } from 'electron'
import type { BoardNotification, NotificationSettings } from '../../../shared/types'
import { loadMattermostWebhookUrl, loadSmtpPassword } from '../credentials'
import { applyInsecureTls, azureFetch } from '../azure/http'
import { requestTaskbarAttention } from './attention'
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

async function deliverApp(
  notification: BoardNotification,
  settings: NotificationSettings,
  ctx: ProviderContext,
) {
  const win = ctx.getMainWindow()
  if (settings.providers.app.flashTaskbar) {
    requestTaskbarAttention(win)
  }

  if (settings.providers.app.showToast && Notification.isSupported()) {
    const toast = new Notification({
      title: notification.title,
      body: notification.body,
      silent: false,
    })
    toast.on('click', () => {
      if (!win || win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    })
    toast.show()
  }
}

async function deliverMattermost(notification: BoardNotification, ctx: ProviderContext) {
  const webhookUrl = loadMattermostWebhookUrl()
  if (!webhookUrl) {
    throw new Error('Mattermost webhook URL is not configured')
  }
  if (ctx.insecureTls) applyInsecureTls(true)

  const text = `**${notification.title}**\n${notification.body}`
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
  await sendSmtpMail({
    host: email.smtpHost,
    port: email.smtpPort || 587,
    secure: email.smtpSecure,
    user: email.smtpUser || undefined,
    password,
    from: email.smtpUser || 'azure-fast-board@localhost',
    to: email.to,
    subject: notification.title,
    text: notification.body,
  })
  void ctx
}
