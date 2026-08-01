import { describe, expect, it, vi, beforeEach } from 'vitest'

const azureFetch = vi.fn()
const applyInsecureTls = vi.fn()

vi.mock('../electron/main/azure/http', () => ({
  azureFetch: (...args: unknown[]) => azureFetch(...args),
  applyInsecureTls: (...args: unknown[]) => applyInsecureTls(...args),
  formatNetworkError: (error: unknown) => String(error),
}))

vi.mock('../electron/main/credentials', () => ({
  loadMattermostPassword: () => 'secret',
}))

vi.mock('../electron/main/store', () => ({
  getSettings: () => ({
    insecureTls: false,
    notifications: {
      providers: {
        mattermost: {
          baseUrl: 'https://mm.example.com',
          loginId: 'ivan@example.com',
          passwordConfigured: true,
        },
      },
    },
  }),
  getConnection: () => ({
    serverUrl: 'https://tfs.example.com',
    collection: 'DefaultCollection',
    project: 'EM',
  }),
}))

describe('buildShareMessage', () => {
  it('formats a bug with emoji, quote and TFS link', async () => {
    const { buildShareMessage } = await import('../electron/main/mattermost/client')
    const message = buildShareMessage(
      {
        id: 25202,
        rev: 1,
        title: 'Тестовый баг',
        type: 'Bug',
        state: 'Active',
        assignedTo: 'Ivan',
        createdBy: 'Petr',
        tags: ['ui', 'mm'],
        reproSteps: '<p><strong>Шаги</strong> воспроизведения</p>',
        comments: [],
        attachments: [],
        history: [],
        relations: [],
        fields: {},
      },
      'https://tfs.example.com/DefaultCollection/EM/_workitems/edit/25202',
    )

    expect(message).toContain('🐛')
    expect(message).toContain('**Bug #25202**')
    expect(message).toContain('### Тестовый баг')
    expect(message).toContain('**Статус:** `Active`')
    expect(message).toContain('📝 **Шаги воспроизведения**')
    expect(message).toContain('> **Шаги** воспроизведения')
    expect(message).toContain(
      '[Открыть карточку в TFS](https://tfs.example.com/DefaultCollection/EM/_workitems/edit/25202)',
    )
    expect(message).toContain('Azure Fast Board')
  })
})

describe('connectMattermostAndPingSelf', () => {
  beforeEach(() => {
    azureFetch.mockReset()
    applyInsecureTls.mockReset()
  })

  it('logs in and posts a self-DM', async () => {
    const { connectMattermostAndPingSelf } = await import('../electron/main/mattermost/client')

    azureFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'user-1', username: 'ivan' }), {
          status: 200,
          headers: { Token: 'tok-abc', 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'channel-self' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'post-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    const result = await connectMattermostAndPingSelf({
      baseUrl: 'https://mm.example.com/api/v4',
      loginId: 'ivan@example.com',
      password: 'secret',
    })

    expect(result.ok).toBe(true)
    expect(result.message).toMatch(/тестовое сообщение отправлено себе/i)
    expect(azureFetch).toHaveBeenCalledTimes(3)

    const loginCall = azureFetch.mock.calls[0]
    expect(String(loginCall[0])).toBe('https://mm.example.com/api/v4/users/login')
    expect(JSON.parse(loginCall[1].body)).toEqual({
      login_id: 'ivan@example.com',
      password: 'secret',
    })

    const dmCall = azureFetch.mock.calls[1]
    expect(String(dmCall[0])).toBe('https://mm.example.com/api/v4/channels/direct')
    expect(JSON.parse(dmCall[1].body)).toEqual(['user-1', 'user-1'])

    const postCall = azureFetch.mock.calls[2]
    expect(String(postCall[0])).toBe('https://mm.example.com/api/v4/posts')
    expect(JSON.parse(postCall[1].body).channel_id).toBe('channel-self')
  })

  it('fails when login is rejected', async () => {
    const { connectMattermostAndPingSelf } = await import('../electron/main/mattermost/client')
    azureFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Invalid login' }), { status: 401 }),
    )

    const result = await connectMattermostAndPingSelf({
      baseUrl: 'https://mm.example.com',
      loginId: 'ivan',
      password: 'bad',
    })

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Invalid login|не удался/i)
    expect(azureFetch).toHaveBeenCalledTimes(1)
  })
})
