import { azureFetch, applyInsecureTls, formatNetworkError } from '../azure/http'
import {
  loadMattermostPassword,
} from '../credentials'
import { getConnection, getSettings } from '../store'
import type { ConnectionConfig, WorkItemDetail } from '../../../shared/types'
import { buildWorkItemWebUrl } from '../../../shared/utils'

export interface MattermostConnectInput {
  baseUrl: string
  loginId: string
  password: string
  insecureTls?: boolean
}

export interface MattermostConnectResult {
  ok: boolean
  message: string
  userId?: string
  username?: string
}

export interface MattermostNamedItem {
  id: string
  name: string
  displayName?: string
}

export type MattermostShareTarget =
  | { mode: 'channel'; teamId: string; channelId: string }
  | { mode: 'user'; userId: string }

interface MmSession {
  baseUrl: string
  token: string
  userId: string
  username?: string
  insecureTls: boolean
}

function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '')
  url = url.replace(/\/api\/v4\/?$/i, '')
  return url
}

function apiUrl(baseUrl: string, path: string) {
  return `${normalizeBaseUrl(baseUrl)}/api/v4${path.startsWith('/') ? path : `/${path}`}`
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  try {
    const json = JSON.parse(text) as { message?: string }
    if (json.message) return json.message
  } catch {
    // not JSON
  }
  return text.slice(0, 240) || `HTTP ${response.status}`
}

function authHeaders(token: string, extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  }
}

function isMattermostConfigured() {
  const settings = getSettings()
  const mm = settings.notifications.providers.mattermost
  return Boolean(mm.baseUrl?.trim() && mm.loginId?.trim() && loadMattermostPassword())
}

export function getMattermostConfigured(): boolean {
  return isMattermostConfigured()
}

async function loginSession(overrides?: Partial<MattermostConnectInput>): Promise<MmSession> {
  const settings = getSettings()
  const mm = settings.notifications.providers.mattermost
  const baseUrl = normalizeBaseUrl(overrides?.baseUrl || mm.baseUrl || '')
  const loginId = (overrides?.loginId || mm.loginId || '').trim()
  const password = overrides?.password || loadMattermostPassword() || ''
  const insecureTls = overrides?.insecureTls ?? settings.insecureTls

  if (!baseUrl) throw new Error('Укажите URL сервера Mattermost в настройках')
  if (!loginId) throw new Error('Укажите логин Mattermost в настройках')
  if (!password) throw new Error('Укажите пароль Mattermost в настройках')

  if (insecureTls) applyInsecureTls(true)

  const loginResponse = await azureFetch(
    apiUrl(baseUrl, '/users/login'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login_id: loginId, password }),
    },
    { preferNode: true, insecureTls },
  )

  if (!loginResponse.ok) {
    throw new Error(`Вход в Mattermost не удался: ${await readError(loginResponse)}`)
  }

  const token =
    loginResponse.headers.get('Token') || loginResponse.headers.get('token') || ''
  if (!token) throw new Error('Mattermost не вернул Token после входа')

  const user = (await loginResponse.json()) as { id?: string; username?: string }
  const userId = user.id?.trim()
  if (!userId) throw new Error('Mattermost не вернул id пользователя')

  return { baseUrl, token, userId, username: user.username, insecureTls }
}

async function mmFetch(session: MmSession, path: string, init: RequestInit = {}) {
  const headers = {
    ...authHeaders(session.token),
    ...(init.headers as Record<string, string> | undefined),
  }
  return azureFetch(
    apiUrl(session.baseUrl, path),
    { ...init, headers },
    { preferNode: true, insecureTls: session.insecureTls },
  )
}

/**
 * Login with login_id/password, then post a DM to the same user ("Message Yourself").
 */
export async function connectMattermostAndPingSelf(
  input: MattermostConnectInput,
): Promise<MattermostConnectResult> {
  try {
    const session = await loginSession(input)
    const channelId = await ensureDirectChannel(session, session.userId)
    const postResponse = await mmFetch(session, '/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel_id: channelId,
        message:
          '✅ Azure Fast Board: подключение к Mattermost успешно. Это тестовое сообщение себе.',
      }),
    })
    if (!postResponse.ok) {
      return {
        ok: false,
        message: `Вход выполнен, но тестовое сообщение себе не отправилось: ${await readError(postResponse)}`,
      }
    }
    const who = session.username ? `@${session.username}` : input.loginId
    return {
      ok: true,
      message: `Mattermost: вход выполнен (${who}), тестовое сообщение отправлено себе`,
      userId: session.userId,
      username: session.username,
    }
  } catch (error) {
    return { ok: false, message: formatNetworkError(error) }
  }
}

export async function listMattermostTeams(): Promise<MattermostNamedItem[]> {
  const session = await loginSession()
  const response = await mmFetch(session, '/users/me/teams')
  if (!response.ok) throw new Error(`Не удалось получить проекты MM: ${await readError(response)}`)
  const teams = (await response.json()) as Array<{ id: string; display_name?: string; name?: string }>
  return teams
    .map((team) => ({
      id: team.id,
      name: team.display_name || team.name || team.id,
      displayName: team.display_name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export async function listMattermostChannels(teamId: string): Promise<MattermostNamedItem[]> {
  const session = await loginSession()
  const response = await mmFetch(session, `/users/me/teams/${encodeURIComponent(teamId)}/channels`)
  if (!response.ok) throw new Error(`Не удалось получить каналы MM: ${await readError(response)}`)
  const channels = (await response.json()) as Array<{
    id: string
    display_name?: string
    name?: string
    type?: string
    delete_at?: number
  }>
  return channels
    .filter((ch) => !ch.delete_at && (ch.type === 'O' || ch.type === 'P'))
    .map((ch) => ({
      id: ch.id,
      name: ch.display_name || ch.name || ch.id,
      displayName: ch.display_name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

function mapMmUsers(
  users: Array<{
    id: string
    username?: string
    first_name?: string
    last_name?: string
    nickname?: string
  }>,
  selfUserId?: string,
): MattermostNamedItem[] {
  return users
    .filter((u) => Boolean(u.id))
    .map((u) => {
      const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
      const label = full || u.nickname || u.username || u.id
      const isSelf = Boolean(selfUserId && u.id === selfUserId)
      return {
        id: u.id,
        name: isSelf ? `${label} (я)` : label,
        displayName: u.username ? `@${u.username}` : undefined,
      }
    })
    .sort((a, b) => {
      // Keep current user at the top so self-DM is easy to find.
      if (selfUserId) {
        if (a.id === selfUserId) return -1
        if (b.id === selfUserId) return 1
      }
      return a.name.localeCompare(b.name, 'ru')
    })
    .slice(0, 50)
}

export async function searchMattermostUsers(term: string): Promise<MattermostNamedItem[]> {
  const session = await loginSession()
  const needle = term.trim()

  // MM rejects empty term on /users/search — list a page instead for the dropdown.
  if (!needle) {
    const response = await mmFetch(session, '/users?page=0&per_page=50')
    if (!response.ok) throw new Error(`Не удалось получить пользователей MM: ${await readError(response)}`)
    const users = (await response.json()) as Array<{
      id: string
      username?: string
      first_name?: string
      last_name?: string
      nickname?: string
    }>
    // Ensure current user is present (self-DM), even if not on the first page.
    if (!users.some((u) => u.id === session.userId)) {
      const meResponse = await mmFetch(session, '/users/me')
      if (meResponse.ok) {
        const me = (await meResponse.json()) as {
          id: string
          username?: string
          first_name?: string
          last_name?: string
          nickname?: string
        }
        users.unshift(me)
      }
    }
    return mapMmUsers(users, session.userId)
  }

  const response = await mmFetch(session, '/users/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ term: needle, allow_inactive: false, limit: 50 }),
  })
  if (!response.ok) throw new Error(`Не удалось найти пользователей MM: ${await readError(response)}`)
  const users = (await response.json()) as Array<{
    id: string
    username?: string
    first_name?: string
    last_name?: string
    nickname?: string
  }>
  return mapMmUsers(users, session.userId)
}

/** Resolve favorite MM users by id so dropdown can show FIO / @username instead of raw ids. */
export async function getMattermostUsersByIds(ids: string[]): Promise<MattermostNamedItem[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (!unique.length) return []
  const session = await loginSession()
  const response = await mmFetch(session, '/users/ids', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(unique),
  })
  if (!response.ok) throw new Error(`Не удалось загрузить пользователей MM: ${await readError(response)}`)
  const users = (await response.json()) as Array<{
    id: string
    username?: string
    first_name?: string
    last_name?: string
    nickname?: string
  }>
  return mapMmUsers(users, session.userId)
}

async function ensureDirectChannel(session: MmSession, otherUserId: string): Promise<string> {
  const response = await mmFetch(session, '/channels/direct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([session.userId, otherUserId]),
  })
  if (!response.ok) {
    throw new Error(`Не удалось открыть личный канал: ${await readError(response)}`)
  }
  const channel = (await response.json()) as { id?: string }
  if (!channel.id) throw new Error('Mattermost не вернул id канала')
  return channel.id
}

function buildMultipart(
  fileField: string,
  fileName: string,
  mimeType: string,
  data: Buffer,
): { contentType: string; body: Buffer } {
  const boundary = `----AFBBoundary${Date.now().toString(16)}`
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fileField}"; filename="${fileName.replace(/"/g, '')}"\r\n` +
      `Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
    'utf8',
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat([head, data, tail]),
  }
}

async function uploadFile(
  session: MmSession,
  channelId: string,
  fileName: string,
  mimeType: string,
  data: Buffer,
): Promise<string> {
  const multipart = buildMultipart('files', fileName, mimeType, data)
  const response = await azureFetch(
    apiUrl(session.baseUrl, `/files?channel_id=${encodeURIComponent(channelId)}`),
    {
      method: 'POST',
      headers: authHeaders(session.token, { 'Content-Type': multipart.contentType }),
      body: multipart.body as unknown as string,
    },
    { preferNode: true, insecureTls: session.insecureTls },
  )
  if (!response.ok) {
    throw new Error(`Не удалось загрузить файл в MM: ${await readError(response)}`)
  }
  const json = (await response.json()) as { file_infos?: Array<{ id?: string }> }
  const fileId = json.file_infos?.[0]?.id
  if (!fileId) throw new Error('Mattermost не вернул id загруженного файла')
  return fileId
}

function htmlToMattermostText(html: string): string {
  return (html || '')
    .replace(/\r\n/g, '\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<\/\s*div\s*>/gi, '\n')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\s*(strong|b)\s*>/gi, '**')
    .replace(/<\/\s*(strong|b)\s*>/gi, '**')
    .replace(/<\s*(em|i)\s*>/gi, '_')
    .replace(/<\/\s*(em|i)\s*>/gi, '_')
    .replace(/<\s*code\b[^>]*>/gi, '`')
    .replace(/<\/\s*code\s*>/gi, '`')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function extractImageSrcs(html: string): string[] {
  const out: string[] = []
  const re = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html || ''))) {
    const src = match[1]?.trim()
    if (src && !out.includes(src)) out.push(src)
  }
  return out
}

export { buildWorkItemWebUrl }

function workItemTypeEmoji(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('bug')) return '🐛'
  if (t.includes('task') || t.includes('задач')) return '✅'
  if (t.includes('user story') || t.includes('story') || t.includes('истор')) return '📘'
  if (t.includes('feature') || t.includes('эпик') || t.includes('epic')) return '🚀'
  if (t.includes('issue') || t.includes('проблем')) return '⚠️'
  return '📋'
}

function quoteBlock(text: string): string {
  const lines = text.split('\n')
  return lines.map((line) => `> ${line || ' '}`).join('\n')
}

/** Rich Mattermost markdown for sharing a work item. */
export function buildShareMessage(
  detail: WorkItemDetail,
  webUrl: string,
  options?: { reason?: 'create' | 'share' },
): string {
  const isBug = /bug/i.test(detail.type)
  const bodyHtml = isBug
    ? detail.reproSteps || detail.description || ''
    : detail.description || detail.reproSteps || ''
  const bodyText = htmlToMattermostText(bodyHtml)
  const emoji = workItemTypeEmoji(detail.type)
  const bodyTitle = isBug ? 'Шаги воспроизведения' : 'Описание'

  const meta: string[] = []
  if (detail.state) meta.push(`**Статус:** \`${detail.state}\``)
  if (detail.assignedTo) meta.push(`**Исполнитель:** ${detail.assignedTo}`)
  if (detail.createdBy) meta.push(`**Автор:** ${detail.createdBy}`)
  if (detail.severity != null) meta.push(`**Приоритет:** ${detail.priority}`)
  if (detail.severity) meta.push(`**Важность:** ${detail.severity}`)
  if (detail.iterationPath) {
    const sprint = detail.iterationPath.split('\\').pop() || detail.iterationPath
    meta.push(`**Итерация:** ${sprint}`)
  }
  if (detail.tags?.length) meta.push(`**Теги:** ${detail.tags.map((t) => `\`${t}\``).join(' ')}`)

  const lines = [
    ...(options?.reason === 'create' ? ['🆕 **Создана новая карточка**', ''] : []),
    `${emoji} **${detail.type} #${detail.id}**`,
    `### ${detail.title}`,
    '',
    '─────',
    '',
    ...(meta.length ? [...meta, ''] : []),
    `📝 **${bodyTitle}**`,
    '',
    bodyText ? quoteBlock(bodyText) : '> _Нет текста_',
    '',
    '─────',
    '',
    `🔗 **[Открыть карточку в TFS](${webUrl})**`,
    '',
    '_Отправлено из Azure Fast Board_',
  ]

  return lines.join('\n')
}

/** Post a plain markdown message to the configured user's self-DM. */
export async function postMattermostToSelf(message: string): Promise<void> {
  const session = await loginSession()
  const channelId = await ensureDirectChannel(session, session.userId)
  const postResponse = await mmFetch(session, '/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel_id: channelId, message }),
  })
  if (!postResponse.ok) {
    throw new Error(`Mattermost: ${await readError(postResponse)}`)
  }
}

export async function shareWorkItemToMattermost(
  detail: WorkItemDetail,
  target: MattermostShareTarget,
  downloadMedia: (url: string) => Promise<{ mimeType: string; dataBase64: string }>,
  options?: { reason?: 'create' | 'share' },
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  try {
    const connection = getConnection()
    if (!connection) return { ok: false, message: 'Нет подключения к Azure DevOps' }

    const webUrl = buildWorkItemWebUrl(connection, detail.id)
    const message = buildShareMessage(detail, webUrl, options)
    const session = await loginSession()

    let channelId: string
    if (target.mode === 'channel') {
      if (!target.channelId) return { ok: false, message: 'Выберите канал Mattermost' }
      channelId = target.channelId
    } else {
      if (!target.userId) return { ok: false, message: 'Выберите пользователя Mattermost' }
      channelId = await ensureDirectChannel(session, target.userId)
    }

    const bodyHtml = /bug/i.test(detail.type)
      ? detail.reproSteps || detail.description || ''
      : detail.description || detail.reproSteps || ''
    const imageSrcs = extractImageSrcs(bodyHtml)
    const attachmentUrls = (detail.attachments || [])
      .map((a) => a.url)
      .filter(Boolean)
    const mediaUrls = [...imageSrcs, ...attachmentUrls].filter(
      (url, index, all) => all.indexOf(url) === index,
    )

    const fileIds: string[] = []
    for (const [index, url] of mediaUrls.entries()) {
      try {
        const media = await downloadMedia(url)
        const binary = Buffer.from(media.dataBase64, 'base64')
        const ext =
          media.mimeType.includes('png')
            ? 'png'
            : media.mimeType.includes('jpeg') || media.mimeType.includes('jpg')
              ? 'jpg'
              : media.mimeType.includes('gif')
                ? 'gif'
                : 'bin'
        const fileId = await uploadFile(
          session,
          channelId,
          `workitem-${detail.id}-${index + 1}.${ext}`,
          media.mimeType || 'application/octet-stream',
          binary,
        )
        fileIds.push(fileId)
      } catch (error) {
        console.warn('[mattermost] skip media', url, error)
      }
    }

    const postResponse = await mmFetch(session, '/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel_id: channelId,
        message,
        file_ids: fileIds.length ? fileIds : undefined,
      }),
    })

    if (!postResponse.ok) {
      return { ok: false, message: `Не удалось отправить в Mattermost: ${await readError(postResponse)}` }
    }

    return {
      ok: true,
      message:
        fileIds.length > 0
          ? `Отправлено в Mattermost (с ${fileIds.length} влож.)`
          : 'Отправлено в Mattermost',
    }
  } catch (error) {
    return { ok: false, message: formatNetworkError(error) }
  }
}

/**
 * If MM is configured and notifyOnCreate is on — DM self with the new work item card.
 * Safe to call fire-and-forget after create.
 */
export async function notifyWorkItemCreatedToMattermostIfEnabled(
  detail: WorkItemDetail,
  downloadMedia: (url: string) => Promise<{ mimeType: string; dataBase64: string }>,
): Promise<void> {
  const mm = getSettings().notifications.providers.mattermost
  if (!mm.notifyOnCreate) return
  if (!getMattermostConfigured()) return

  const session = await loginSession()
  const result = await shareWorkItemToMattermost(
    detail,
    { mode: 'user', userId: session.userId },
    downloadMedia,
    { reason: 'create' },
  )
  if (!result.ok) {
    console.warn('[mattermost] notify on create failed:', result.message)
  }
}
