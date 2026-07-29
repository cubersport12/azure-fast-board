import type {
  AttachmentUpload,
  BoardColumn,
  ConnectionConfig,
  ConnectionTestResult,
  CreateWorkItemInput,
  PatchWorkItemInput,
  WorkItem,
  WorkItemComment,
  WorkItemDetail,
  WorkItemTypeInfo,
  AssigneeIdentity,
  AreaPathsResult,
  AreaPathOption,
  IterationPathsResult,
  IterationPathOption,
} from '../../../shared/types'
import { parseTags, normalizeIterationFieldPath } from '../../../shared/utils'
import { AzureDevOpsError } from './errors'
import { applyInsecureTls, azureFetch, formatNetworkError } from './http'

export { AzureDevOpsError } from './errors'

interface ClientOptions {
  connection: ConnectionConfig
  pat?: string
  password?: string
  insecureTls?: boolean
  username?: string
}

interface IdentityRef {
  displayName?: string
  uniqueName?: string
}

interface RawWorkItem {
  id: number
  rev: number
  url?: string
  fields?: Record<string, unknown>
  relations?: Array<{ rel: string; url: string; attributes?: Record<string, unknown> }>
}

function identityName(value: unknown) {
  if (!value) return undefined
  if (typeof value === 'string') return value
  const identity = value as IdentityRef
  return identity.displayName || identity.uniqueName
}

function identityUnique(value: unknown) {
  if (!value || typeof value === 'string') return undefined
  return (value as IdentityRef).uniqueName
}

/**
 * Azure DevOps PAT must be the raw token.
 * Accepts: raw PAT, npmrc `_password` (base64 of raw PAT), or Basic base64("user:pat").
 */
export function normalizePatSecret(raw: string) {
  let value = raw.trim()
  if (!value) return ''

  const basicPrefix = /^Basic\s+(.+)$/i.exec(value)
  if (basicPrefix) value = basicPrefix[1].trim()

  value = value.replace(/\s+/g, '')
  if (!value) return ''

  if (/^[A-Za-z0-9+/]+=*$/.test(value) && value.length >= 16 && value.length % 4 === 0) {
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf8')
      if (!/^[\x20-\x7E]+$/.test(decoded) || decoded.length < 16) return value

      // Basic credential: "user:pat" or ":pat"
      if (decoded.includes(':')) {
        const colon = decoded.indexOf(':')
        const user = decoded.slice(0, colon)
        const pass = decoded.slice(colon + 1)
        if (pass.length >= 16 && user.length < 128) return pass
      }

      // npmrc style: _password is base64(rawPat) with no colon
      if (!/[\r\n]/.test(decoded)) return decoded
    } catch {
      // keep raw
    }
  }

  return value
}

/**
 * Build Authorization header for Azure DevOps.
 * PAT on on-prem (esp. with IIS Basic Auth) matches npm/Artifacts:
 * Basic base64("{non-empty-user}:{pat}") — empty username often 401s here.
 */
export function azureBasicAuthHeader(
  secret: string,
  authMethod: 'pat' | 'password' = 'pat',
  username = '',
) {
  const token = authMethod === 'pat' ? normalizePatSecret(secret) : secret
  const user =
    authMethod === 'pat' ? username.trim() || 'VssSessionToken' : username
  return `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`
}

export function mapWorkItem(raw: RawWorkItem): WorkItem {
  const fields = raw.fields ?? {}
  return {
    id: raw.id,
    rev: raw.rev,
    title: String(fields['System.Title'] ?? ''),
    type: String(fields['System.WorkItemType'] ?? 'Item'),
    state: String(fields['System.State'] ?? ''),
    boardColumn: fields['System.BoardColumn'] ? String(fields['System.BoardColumn']) : undefined,
    assignedTo: identityName(fields['System.AssignedTo']),
    assignedToUniqueName: identityUnique(fields['System.AssignedTo']),
    createdBy: identityName(fields['System.CreatedBy']),
    createdByUniqueName: identityUnique(fields['System.CreatedBy']),
    areaPath: fields['System.AreaPath'] ? String(fields['System.AreaPath']) : undefined,
    iterationPath: fields['System.IterationPath'] ? String(fields['System.IterationPath']) : undefined,
    tags: parseTags(fields['System.Tags'] as string | undefined),
    priority: typeof fields['Microsoft.VSTS.Common.Priority'] === 'number'
      ? fields['Microsoft.VSTS.Common.Priority']
      : undefined,
    severity: fields['Microsoft.VSTS.Common.Severity']
      ? String(fields['Microsoft.VSTS.Common.Severity'])
      : undefined,
    changedDate: fields['System.ChangedDate'] ? String(fields['System.ChangedDate']) : undefined,
    createdDate: fields['System.CreatedDate'] ? String(fields['System.CreatedDate']) : undefined,
    description: fields['System.Description'] ? String(fields['System.Description']) : undefined,
    url: raw.url,
  }
}

export class AzureClient {
  private connection: ConnectionConfig
  private secret: string
  private insecureTls: boolean
  private username: string
  private authMethod: 'pat' | 'password'

  constructor(options: ClientOptions) {
    this.connection = options.connection
    this.authMethod = options.connection.authMethod || (options.password ? 'password' : 'pat')
    const rawSecret = (this.authMethod === 'password' ? options.password : options.pat)?.trim() || ''
    this.secret =
      this.authMethod === 'pat' ? normalizePatSecret(rawSecret) : rawSecret
    this.insecureTls = Boolean(options.insecureTls)
    this.username = (options.username ?? options.connection.username ?? '').trim()

    if (!this.secret) {
      throw new AzureDevOpsError(
        this.authMethod === 'password' ? 'Password is required' : 'PAT is required',
        401,
      )
    }
    if (this.authMethod === 'password' && !this.username) {
      throw new AzureDevOpsError('Username is required for login/password auth', 401)
    }
  }

  get baseUrl() {
    const server = this.connection.serverUrl.replace(/\/$/, '')
    return `${server}/${encodeURIComponent(this.connection.collection)}`
  }

  get projectUrl() {
    return `${this.baseUrl}/${encodeURIComponent(this.connection.project)}`
  }

  private authHeader() {
    // Match Azure Artifacts / npmrc: non-empty username + raw PAT as password.
    const patUser =
      this.connection.collection?.trim() ||
      this.username.trim() ||
      'VssSessionToken'
    return azureBasicAuthHeader(
      this.secret,
      this.authMethod,
      this.authMethod === 'pat' ? patUser : this.username,
    )
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    if (!headers.has('Accept')) headers.set('Accept', 'application/json')
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    if (this.insecureTls) applyInsecureTls(true)

    // On-prem Azure DevOps Server typically requires Windows NTLM, not Basic.
    if (this.authMethod === 'password') {
      return this.requestNtlm<T>(url, init, headers)
    }

    headers.set('Authorization', this.authHeader())

    let response: Response
    try {
      // PAT: Node fetch — Chromium net.fetch can fail Basic auth on on-prem IIS.
      response = await azureFetch(
        url,
        {
          ...init,
          headers,
        },
        { preferNode: true, insecureTls: this.insecureTls },
      )
    } catch (error) {
      if (error instanceof AzureDevOpsError) throw error
      throw new AzureDevOpsError(formatNetworkError(error), 0)
    }

    return this.parseResponse<T>(response)
  }

  private async requestNtlm<T>(url: string, init: RequestInit, headers: Headers): Promise<T> {
    const { ntlmRequest } = await import('./ntlm')
    let result
    try {
      result = await ntlmRequest({
        url,
        method: init.method || 'GET',
        username: this.username,
        password: this.secret,
        headers,
        body: init.body,
        insecureTls: this.insecureTls,
      })
    } catch (error) {
      if (error instanceof AzureDevOpsError) throw error
      throw new AzureDevOpsError(formatNetworkError(error), 0)
    }

    if (result.status < 200 || result.status >= 300) {
      let details = result.bodyText.slice(0, 400)
      try {
        const payload = JSON.parse(result.bodyText) as { message?: string }
        if (payload.message) details = payload.message
      } catch {
        // keep raw
      }

      if (result.status === 401) {
        throw new AzureDevOpsError(
          [
            'HTTP 401 Unauthorized — NTLM login rejected.',
            'Check DOMAIN\\user and password.',
            'If username is email (UPN), try DOMAIN\\samAccountName instead.',
            details ? `Details: ${details}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          401,
        )
      }

      throw new AzureDevOpsError(details || `HTTP ${result.status}`, result.status)
    }

    if (result.status === 204 || !result.bodyText) return undefined as T
    if (result.contentType.includes('application/json') || result.bodyText.trim().startsWith('{')) {
      return JSON.parse(result.bodyText) as T
    }
    return undefined as T
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let details = response.statusText
      try {
        const payload = (await response.clone().json()) as { message?: string }
        if (payload.message) details = payload.message
      } catch {
        // ignore
      }

      if (response.status === 401) {
        const wwwAuth = response.headers.get('www-authenticate') || ''
        const hasIisBasic = /basic\s+realm=/i.test(wwwAuth)
        const hasWindows = /negotiate|ntlm/i.test(wwwAuth)
        throw new AzureDevOpsError(
          [
            'HTTP 401 Unauthorized — server rejected credentials.',
            this.authMethod === 'pat'
              ? [
                  'PAT auth for Work Item REST failed (Node https, Basic Collection|VssSessionToken:PAT).',
                  wwwAuth ? `WWW-Authenticate: ${wwwAuth}` : '',
                  hasIisBasic && hasWindows
                    ? [
                        'This IIS site has Basic Authentication enabled.',
                        'That breaks PAT for REST APIs (boards/work items).',
                        'npm still works because Azure Artifacts uses /_packaging/* — a different auth path.',
                        '',
                        'Use Login/Password (NTLM) in this app.',
                        'Or ask an admin to disable IIS Basic Authentication (keep Anonymous + Windows Auth).',
                      ].join('\n')
                    : 'Use Login/Password (NTLM), or check that the PAT was created on this on-prem server.',
                ]
                  .filter(Boolean)
                  .join('\n')
              : 'For on-prem with Windows Auth use Login/Password (NTLM).',
            details && details !== 'Unauthorized' ? `Details: ${details}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          401,
        )
      }

      throw new AzureDevOpsError(details || `HTTP ${response.status}`, response.status)
    }

    if (response.status === 204) return undefined as T
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) return (await response.json()) as T
    return undefined as T
  }

  private api(path: string, apiVersion = this.connection.apiVersion) {
    const join = path.includes('?') ? '&' : '?'
    return `${this.projectUrl}${path}${join}api-version=${apiVersion}`
  }

  private collectionApi(path: string, apiVersion = this.connection.apiVersion) {
    const join = path.includes('?') ? '&' : '?'
    return `${this.baseUrl}${path}${join}api-version=${apiVersion}`
  }

  async discoverApiVersion(): Promise<string> {
    const candidates = [
      this.connection.apiVersion,
      '7.1',
      '7.0',
      '6.0',
      '5.1',
      '4.1',
    ]
    for (const version of Array.from(new Set(candidates))) {
      try {
        if (this.connection.collection) {
          await this.request<{ count: number }>(
            `${this.baseUrl}/_apis/projects?api-version=${version}&$top=1`,
          )
        } else {
          await this.request<{ count: number }>(
            `${this.serverRoot}/_apis/projectCollections?api-version=${version}&$top=1`,
          )
        }
        this.connection.apiVersion = version
        return version
      } catch (error) {
        if (error instanceof AzureDevOpsError && (error.status === 401 || error.status === 403)) {
          throw error
        }
      }
    }
    return this.connection.apiVersion
  }

  get serverRoot() {
    return this.connection.serverUrl.replace(/\/$/, '')
  }

  async listCollections(): Promise<{
    collections: Array<{ id: string; name: string }>
    apiVersion: string
    serverUrl: string
  }> {
    const apiVersion = await this.discoverApiVersion()
    const roots = [this.serverRoot]
    // Common on-prem layout: https://server/tfs
    if (!/\/tfs$/i.test(this.serverRoot)) {
      roots.push(`${this.serverRoot}/tfs`)
    }

    let lastError: unknown
    for (const root of roots) {
      try {
        const payload = await this.request<{
          value?: Array<{ id: string; name: string; collection?: { id: string; name: string } }>
        }>(`${root}/_apis/projectCollections?api-version=${apiVersion}`)

        const collections = (payload.value ?? [])
          .map((entry) => ({
            id: entry.id || entry.collection?.id || entry.name,
            name: entry.name || entry.collection?.name || entry.id,
          }))
          .filter((entry) => entry.name)

        if (collections.length) {
          // Persist discovered root if /tfs worked
          if (root !== this.serverRoot) {
            this.connection.serverUrl = root
          }
          return { collections, apiVersion, serverUrl: this.connection.serverUrl }
        }
      } catch (error) {
        lastError = error
      }
    }

    // Fallback: some servers expose a single DefaultCollection only via projects probe
    for (const name of ['DefaultCollection', 'Default']) {
      try {
        await this.request<{ count: number }>(
          `${this.serverRoot}/${encodeURIComponent(name)}/_apis/projects?api-version=${apiVersion}&$top=1`,
        )
        return {
          collections: [{ id: name, name }],
          apiVersion,
          serverUrl: this.connection.serverUrl,
        }
      } catch {
        // continue
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new AzureDevOpsError('Could not load collections from server')
  }

  async listProjects(): Promise<Array<{ id: string; name: string }>> {
    if (!this.connection.collection) throw new AzureDevOpsError('Collection is required')
    const apiVersion = this.connection.apiVersion || (await this.discoverApiVersion())
    const payload = await this.request<{ value: Array<{ id: string; name: string }> }>(
      `${this.baseUrl}/_apis/projects?api-version=${apiVersion}&$top=500&stateFilter=WellFormed`,
    )
    return payload.value ?? []
  }

  async listTeams(): Promise<Array<{ id: string; name: string }>> {
    if (!this.connection.collection || !this.connection.project) {
      throw new AzureDevOpsError('Collection and project are required')
    }
    const apiVersion = this.connection.apiVersion || (await this.discoverApiVersion())
    try {
      const payload = await this.request<{ value: Array<{ id: string; name: string }> }>(
        `${this.baseUrl}/_apis/projects/${encodeURIComponent(this.connection.project)}/teams?api-version=${apiVersion}`,
      )
      return payload.value ?? []
    } catch {
      const payload = await this.request<{ value: Array<{ id: string; name: string }> }>(
        this.api('/_apis/teams', apiVersion),
      )
      return payload.value ?? []
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const { collections, apiVersion } = await this.listCollections()
      this.connection.apiVersion = apiVersion

      let projects: Array<{ id: string; name: string }> = []
      let teams: Array<{ id: string; name: string }> = []

      if (this.connection.collection) {
        projects = await this.listProjects()
      } else if (collections[0]) {
        this.connection.collection = collections[0].name
        projects = await this.listProjects()
      }

      if (this.connection.project) {
        teams = await this.listTeams()
      }

      return {
        ok: true,
        message: `Connected (API ${apiVersion})`,
        collections,
        projects,
        teams,
        apiVersion,
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      }
    }
  }

  async getCurrentUser(): Promise<AssigneeIdentity> {
    const looksLikeLogin = (value?: string | null) => {
      const v = value?.trim()
      if (!v) return true
      return v.includes('\\') || /^[^\s@]+@[^\s@]+$/.test(v)
    }

    const pickFio = (...candidates: Array<string | undefined | null>) => {
      for (const candidate of candidates) {
        const value = candidate?.trim()
        if (value && !looksLikeLogin(value)) return value
      }
      return undefined
    }

    const accountFrom = (properties?: Record<string, { $value?: string }>) =>
      properties?.Account?.$value?.trim() ||
      properties?.Mail?.$value?.trim() ||
      properties?.DirectoryAlias?.$value?.trim() ||
      undefined

    let account = this.username || undefined
    let id: string | undefined
    let fromConnection: string | undefined

    try {
      const payload = await this.request<{
        authenticatedUser?: {
          id?: string
          providerDisplayName?: string
          customDisplayName?: string
          properties?: Record<string, { $value?: string }>
        }
        authorizedUser?: {
          id?: string
          providerDisplayName?: string
          customDisplayName?: string
          properties?: Record<string, { $value?: string }>
        }
      }>(this.collectionApi('/_apis/connectionData'))

      const user = payload.authenticatedUser || payload.authorizedUser
      id = user?.id
      account = accountFrom(user?.properties) || account
      fromConnection = pickFio(user?.customDisplayName, user?.providerDisplayName)
    } catch {
      // continue with other sources
    }

    // Full AD display name (ФИО) is often on the identity record, not connectionData.
    if (id) {
      try {
        const identity = await this.request<{
          id?: string
          providerDisplayName?: string
          customDisplayName?: string
          properties?: Record<string, { $value?: string }>
        }>(
          `${this.baseUrl}/_apis/identities/${encodeURIComponent(id)}?queryMembership=None&api-version=${this.connection.apiVersion}`,
        )
        account = accountFrom(identity.properties) || account
        const fio = pickFio(
          identity.customDisplayName,
          identity.properties?.DirectoryDisplayName?.$value,
          identity.properties?.DisplayName?.$value,
          identity.providerDisplayName,
        )
        if (fio) {
          return { id: identity.id || id, displayName: fio, uniqueName: account }
        }
      } catch {
        // ignore
      }
    }

    // Team members expose friendly displayName (ФИО) matched by login.
    if (account || this.username) {
      try {
        const people = await this.listAssignees()
        const me = (account || this.username || '').trim().toLowerCase()
        const local = me.includes('\\') ? me.slice(me.lastIndexOf('\\') + 1) : me.split('@')[0]
        const match = people.find((person) => {
          const candidates = [person.uniqueName, person.displayName]
            .filter(Boolean)
            .map((value) => String(value).trim().toLowerCase())
          return candidates.some((candidate) => {
            const candidateLocal = candidate.includes('\\')
              ? candidate.slice(candidate.lastIndexOf('\\') + 1)
              : candidate.split('@')[0]
            return candidate === me || candidateLocal === local
          })
        })
        const fio = pickFio(match?.displayName)
        if (fio) {
          return {
            id: match?.id || id,
            displayName: fio,
            uniqueName: match?.uniqueName || account,
          }
        }
      } catch {
        // ignore
      }
    }

    // Identity search by account/login — sometimes returns DirectoryDisplayName.
    const searchNeedle =
      (account && (account.includes('\\') ? account.slice(account.lastIndexOf('\\') + 1) : account)) ||
      this.username
    if (searchNeedle && searchNeedle.length >= 2) {
      try {
        const found = await this.searchAssignees(searchNeedle)
        const me = (account || this.username || '').trim().toLowerCase()
        const local = me.includes('\\') ? me.slice(me.lastIndexOf('\\') + 1) : me.split('@')[0]
        const match =
          found.find((person) => {
            const unique = (person.uniqueName || '').trim().toLowerCase()
            const uniqueLocal = unique.includes('\\')
              ? unique.slice(unique.lastIndexOf('\\') + 1)
              : unique.split('@')[0]
            return unique === me || uniqueLocal === local
          }) || found.find((person) => !looksLikeLogin(person.displayName))

        const fio = pickFio(match?.displayName)
        if (fio) {
          return {
            id: match?.id || id,
            displayName: fio,
            uniqueName: match?.uniqueName || account,
          }
        }
      } catch {
        // ignore
      }
    }

    // IdentityPicker often returns AD displayName (ФИО) even when IMS only has DOMAIN\user.
    if (searchNeedle && searchNeedle.length >= 2) {
      try {
        const picker = await this.request<{
          results?: Array<{
            identities?: Array<{
              entityId?: string
              displayName?: string
              samAccountName?: string
              signInAddress?: string
              mail?: string
              scopeName?: string
            }>
          }>
        }>(`${this.baseUrl}/_apis/IdentityPicker/Identities?api-version=5.1-preview.1`, {
          method: 'POST',
          body: JSON.stringify({
            query: searchNeedle,
            identityTypes: ['user'],
            operationScopes: ['ims', 'source'],
            options: { MinResults: 1, MaxResults: 20 },
            properties: [
              'DisplayName',
              'Mail',
              'SamAccountName',
              'Department',
              'JobTitle',
              'AccountName',
            ],
          }),
        })

        const identities = (picker.results ?? []).flatMap((row) => row.identities ?? [])
        const me = (account || this.username || '').trim().toLowerCase()
        const local = me.includes('\\') ? me.slice(me.lastIndexOf('\\') + 1) : me.split('@')[0]
        const match =
          identities.find((entry) => {
            const candidates = [entry.samAccountName, entry.signInAddress, entry.mail]
              .filter(Boolean)
              .map((value) => String(value).trim().toLowerCase())
            return candidates.some((candidate) => {
              const candidateLocal = candidate.includes('\\')
                ? candidate.slice(candidate.lastIndexOf('\\') + 1)
                : candidate.split('@')[0]
              return candidate === me || candidate === local || candidateLocal === local
            })
          }) || identities[0]

        const fio = pickFio(match?.displayName)
        if (fio) {
          return {
            id: match?.entityId || id,
            displayName: fio,
            uniqueName: account || match?.signInAddress || match?.samAccountName,
          }
        }
      } catch {
        // ignore
      }
    }

    if (fromConnection) {
      return { id, displayName: fromConnection, uniqueName: account }
    }
    if (account || this.username) {
      return { id, displayName: account || this.username, uniqueName: account || this.username }
    }
    throw new AzureDevOpsError('Не удалось определить текущего пользователя')
  }

  async listWorkItems(wiql?: string): Promise<WorkItem[]> {
    const query =
      wiql ||
      `Select [System.Id] From WorkItems Where [System.TeamProject] = @project Order By [System.ChangedDate] Desc`

    const idsPayload = await this.request<{ workItems: Array<{ id: number }> }>(
      this.api('/_apis/wit/wiql'),
      {
        method: 'POST',
        body: JSON.stringify({ query }),
      },
    )

    const ids = (idsPayload.workItems ?? []).map((item) => item.id).slice(0, 200)
    if (!ids.length) return []

    const batches: number[][] = []
    for (let i = 0; i < ids.length; i += 200) batches.push(ids.slice(i, i + 200))

    const items: WorkItem[] = []
    for (const batch of batches) {
      const payload = await this.request<{ value: RawWorkItem[] }>(
        this.api(`/_apis/wit/workitems?ids=${batch.join(',')}&$expand=relations`),
      )
      items.push(...(payload.value ?? []).map(mapWorkItem))
    }
    return items
  }

  async getWorkItem(id: number): Promise<WorkItemDetail> {
    const raw = await this.request<RawWorkItem>(
      this.api(`/_apis/wit/workitems/${id}?$expand=all`),
    )
    const base = mapWorkItem(raw)
    const comments = await this.getComments(id)
    const attachments = (raw.relations ?? [])
      .filter((relation) => relation.rel === 'AttachedFile')
      .map((relation, index) => ({
        id: String(relation.attributes?.id ?? index),
        name: String(relation.attributes?.name ?? `attachment-${index}`),
        url: relation.url,
      }))

    return {
      ...base,
      comments,
      attachments,
      history: [],
      relations: raw.relations ?? [],
      fields: raw.fields ?? {},
    }
  }

  async createWorkItem(input: CreateWorkItemInput): Promise<WorkItem> {
    const ops: Array<Record<string, unknown>> = [
      { op: 'add', path: '/fields/System.Title', value: input.title },
    ]
    if (input.description) {
      ops.push({ op: 'add', path: '/fields/System.Description', value: input.description })
    }
    if (input.assignedTo) {
      ops.push({ op: 'add', path: '/fields/System.AssignedTo', value: input.assignedTo })
    }
    if (input.areaPath) {
      ops.push({ op: 'add', path: '/fields/System.AreaPath', value: input.areaPath })
    }
    if (input.iterationPath) {
      const iterationPath = normalizeIterationFieldPath(
        input.iterationPath,
        this.connection.project,
      )
      if (iterationPath) {
        ops.push({ op: 'add', path: '/fields/System.IterationPath', value: iterationPath })
      }
    }
    if (input.tags?.length) {
      ops.push({ op: 'add', path: '/fields/System.Tags', value: input.tags.join('; ') })
    }
    if (input.boardColumn) {
      ops.push({ op: 'add', path: '/fields/System.State', value: input.boardColumn })
    }
    if (input.fields) {
      for (const [key, value] of Object.entries(input.fields)) {
        ops.push({ op: 'add', path: `/fields/${key}`, value })
      }
    }

    const raw = await this.request<RawWorkItem>(
      this.api(`/_apis/wit/workitems/$${encodeURIComponent(input.type)}`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json-patch+json' },
        body: JSON.stringify(ops),
      },
    )
    return mapWorkItem(raw)
  }

  async updateWorkItem(input: PatchWorkItemInput): Promise<WorkItem> {
    const ops = Object.entries(input.fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        let next = value
        if (key === 'System.IterationPath' && typeof value === 'string') {
          next = normalizeIterationFieldPath(value, this.connection.project) || null
        }
        return {
          op: 'add',
          path: `/fields/${key}`,
          value: next,
        }
      })

    const raw = await this.request<RawWorkItem>(
      this.api(`/_apis/wit/workitems/${input.id}`),
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json-patch+json',
          'If-Match': String(input.rev),
        },
        body: JSON.stringify(ops),
      },
    )
    return mapWorkItem(raw)
  }

  async moveWorkItem(id: number, column: string, rev: number, fallbackState?: string) {
    // System.BoardColumn is read-only on many on-prem boards; column is driven by State.
    const nextState = (fallbackState || column).trim()
    if (!nextState) throw new Error('Целевое состояние не задано')
    return this.updateWorkItem({
      id,
      rev,
      fields: { 'System.State': nextState },
    })
  }

  async getComments(id: number): Promise<WorkItemComment[]> {
    try {
      const payload = await this.request<{
        comments?: Array<{
          id: number
          text: string
          createdDate: string
          createdBy?: IdentityRef
        }>
      }>(this.api(`/_apis/wit/workItems/${id}/comments`, '7.0-preview.3'))

      return (payload.comments ?? []).map((comment) => ({
        id: comment.id,
        text: comment.text,
        createdDate: comment.createdDate,
        createdBy: comment.createdBy?.displayName || comment.createdBy?.uniqueName || 'Unknown',
      }))
    } catch {
      return []
    }
  }

  async addComment(id: number, text: string): Promise<WorkItemComment> {
    const payload = await this.request<{
      id: number
      text: string
      createdDate: string
      createdBy?: IdentityRef
    }>(this.api(`/_apis/wit/workItems/${id}/comments`, '7.0-preview.3'), {
      method: 'POST',
      body: JSON.stringify({ text }),
    })

    return {
      id: payload.id,
      text: payload.text,
      createdDate: payload.createdDate,
      createdBy: payload.createdBy?.displayName || payload.createdBy?.uniqueName || 'You',
    }
  }

  private resolveMediaUrl(url: string) {
    const trimmed = url.trim()
    if (!trimmed) throw new AzureDevOpsError('Media URL is empty', 400)
    if (trimmed.startsWith('data:')) return trimmed
    if (trimmed.startsWith('//')) {
      const server = new URL(this.connection.serverUrl)
      return `${server.protocol}${trimmed}`
    }
    if (trimmed.startsWith('/')) {
      return new URL(trimmed, this.connection.serverUrl).toString()
    }
    return trimmed
  }

  private assertAllowedMediaUrl(url: string) {
    if (url.startsWith('data:')) return
    const server = new URL(this.connection.serverUrl)
    const target = new URL(url)
    if (target.hostname.toLowerCase() !== server.hostname.toLowerCase()) {
      throw new AzureDevOpsError('Refusing to fetch media from an external host', 400)
    }
  }

  private guessMimeType(url: string, contentType: string) {
    const raw = contentType.split(';')[0]?.trim()
    if (raw && raw !== 'application/octet-stream') return raw
    const lower = url.toLowerCase()
    if (lower.includes('.png')) return 'image/png'
    if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg'
    if (lower.includes('.gif')) return 'image/gif'
    if (lower.includes('.webp')) return 'image/webp'
    if (lower.includes('.bmp')) return 'image/bmp'
    return 'image/png'
  }

  /** Authenticated download for attachment / embedded image URLs (PAT or NTLM). */
  async downloadMedia(url: string): Promise<{ mimeType: string; dataBase64: string }> {
    const resolved = this.resolveMediaUrl(url)
    if (resolved.startsWith('data:')) {
      const match = /^data:([^;,]+)?(?:;base64)?,([\s\S]*)$/i.exec(resolved)
      if (!match) throw new AzureDevOpsError('Invalid data URL', 400)
      return {
        mimeType: match[1] || 'image/png',
        dataBase64: match[2] || '',
      }
    }

    this.assertAllowedMediaUrl(resolved)
    if (this.insecureTls) applyInsecureTls(true)

    const headers = new Headers({ Accept: '*/*' })

    if (this.authMethod === 'password') {
      const { ntlmRequest } = await import('./ntlm')
      let result
      try {
        result = await ntlmRequest({
          url: resolved,
          method: 'GET',
          username: this.username,
          password: this.secret,
          headers,
          insecureTls: this.insecureTls,
          binary: true,
        })
      } catch (error) {
        if (error instanceof AzureDevOpsError) throw error
        throw new AzureDevOpsError(formatNetworkError(error), 0)
      }

      if (result.status < 200 || result.status >= 300) {
        throw new AzureDevOpsError(`Failed to download media (HTTP ${result.status})`, result.status)
      }

      return {
        mimeType: this.guessMimeType(resolved, result.contentType),
        dataBase64: result.body.toString('base64'),
      }
    }

    headers.set('Authorization', this.authHeader())
    let response: Response
    try {
      response = await azureFetch(
        resolved,
        { method: 'GET', headers },
        { preferNode: true, insecureTls: this.insecureTls },
      )
    } catch (error) {
      if (error instanceof AzureDevOpsError) throw error
      throw new AzureDevOpsError(formatNetworkError(error), 0)
    }

    if (!response.ok) {
      throw new AzureDevOpsError(`Failed to download media (HTTP ${response.status})`, response.status)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    return {
      mimeType: this.guessMimeType(resolved, response.headers.get('content-type') || ''),
      dataBase64: buffer.toString('base64'),
    }
  }

  async uploadAttachment(id: number, file: AttachmentUpload): Promise<WorkItemDetail> {
    const binary = Buffer.from(file.dataBase64, 'base64')
    const uploadUrl = this.api(
      `/_apis/wit/attachments?fileName=${encodeURIComponent(file.fileName)}&uploadType=Simple`,
    )

    const uploaded = await this.request<{ url: string }>(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        Authorization: this.authHeader(),
      },
      body: new Uint8Array(binary),
    })

    const current = await this.request<RawWorkItem>(
      this.api(`/_apis/wit/workitems/${id}?$expand=relations`),
    )

    await this.request<RawWorkItem>(this.api(`/_apis/wit/workitems/${id}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json-patch+json',
        'If-Match': String(current.rev),
      },
      body: JSON.stringify([
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: 'AttachedFile',
            url: uploaded.url,
            attributes: { comment: file.fileName },
          },
        },
      ]),
    })

    return this.getWorkItem(id)
  }

  async removeAttachment(id: number, attachmentUrl: string): Promise<WorkItemDetail> {
    const current = await this.request<RawWorkItem>(
      this.api(`/_apis/wit/workitems/${id}?$expand=relations`),
    )
    const relations = current.relations ?? []
    const relationIndex = relations.findIndex((relation) => {
      if (relation.rel !== 'AttachedFile') return false
      const left = relation.url
      const right = attachmentUrl
      if (left === right) return true
      if (left.includes(right) || right.includes(left)) return true
      const guidRe =
        /\/attachments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
      const leftGuid = guidRe.exec(left)?.[1]?.toLowerCase()
      const rightGuid = guidRe.exec(right)?.[1]?.toLowerCase()
      return Boolean(leftGuid && rightGuid && leftGuid === rightGuid)
    })

    const description = current.fields?.['System.Description']
      ? String(current.fields['System.Description'])
      : ''
    // Local helper: strip matching <img> (keeps client free of frontend imports)
    const stripImg = (html: string, target: string) => {
      if (!html || !target.trim()) return html
      const guidRe =
        /\/attachments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
      const targetGuid = guidRe.exec(target)?.[1]?.toLowerCase()
      const matchUrl = (src: string) => {
        const left = src.trim()
        const right = target.trim()
        if (left === right) return true
        const leftGuid = guidRe.exec(left)?.[1]?.toLowerCase()
        if (targetGuid && leftGuid && targetGuid === leftGuid) return true
        return left.includes(right) || right.includes(left)
      }
      return html
        .replace(/<p>\s*(<img\b[^>]*>)\s*<\/p>|<img\b[^>]*>/gi, (chunk, wrapped?: string) => {
          const tag = wrapped || chunk
          const src = /src=["']([^"']+)["']/i.exec(tag)?.[1]
          if (!src) return chunk
          return matchUrl(src) ? '' : chunk
        })
        .replace(/(<p>\s*<\/p>)+/gi, '')
        .trim()
    }
    const nextDescription = stripImg(description, attachmentUrl)
    const ops: Array<Record<string, unknown>> = []
    if (relationIndex >= 0) {
      ops.push({ op: 'remove', path: `/relations/${relationIndex}` })
    }
    if (nextDescription !== description) {
      ops.push({
        op: 'add',
        path: '/fields/System.Description',
        value: nextDescription || '',
      })
    }
    if (!ops.length) {
      throw new Error('Вложение не найдено')
    }

    await this.request<RawWorkItem>(this.api(`/_apis/wit/workitems/${id}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json-patch+json',
        'If-Match': String(current.rev),
      },
      body: JSON.stringify(ops),
    })

    return this.getWorkItem(id)
  }

  private dedupeAssignees(entries: AssigneeIdentity[]) {
    const byKey = new Map<string, AssigneeIdentity>()
    for (const entry of entries) {
      const key = (entry.uniqueName || entry.displayName || entry.id || '').trim().toLowerCase()
      if (!key || byKey.has(key)) continue
      byKey.set(key, {
        displayName: entry.displayName.trim(),
        uniqueName: entry.uniqueName?.trim() || undefined,
        id: entry.id,
      })
    }
    return [...byKey.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  async listAssignees(): Promise<AssigneeIdentity[]> {
    const people: AssigneeIdentity[] = []

    try {
      const team = this.connection.team || this.connection.project
      const project = this.connection.project
      if (project && team) {
        const payload = await this.request<{
          value: Array<{
            identity?: {
              id?: string
              displayName?: string
              uniqueName?: string
            }
          }>
        }>(
          `${this.baseUrl}/_apis/projects/${encodeURIComponent(project)}/teams/${encodeURIComponent(team)}/members?api-version=${this.connection.apiVersion}&$top=500`,
        )
        for (const row of payload.value ?? []) {
          const identity = row.identity
          if (!identity?.displayName) continue
          people.push({
            id: identity.id,
            displayName: identity.displayName,
            uniqueName: identity.uniqueName,
          })
        }
      }
    } catch {
      // Fall back to identities from recent work items below.
    }

    try {
      const items = await this.listWorkItems()
      for (const item of items) {
        if (!item.assignedTo) continue
        people.push({
          displayName: item.assignedTo,
          uniqueName: item.assignedToUniqueName,
        })
      }
    } catch {
      // ignore
    }

    if (this.username) {
      people.push({
        displayName: this.username,
        uniqueName: this.username,
      })
    }

    return this.dedupeAssignees(people)
  }

  async searchAssignees(query: string): Promise<AssigneeIdentity[]> {
    const q = query.trim()
    if (q.length < 2) return this.listAssignees()

    try {
      const apiVersion = this.connection.apiVersion || '5.0'
      const payload = await this.request<{
        value: Array<{
          id?: string
          providerDisplayName?: string
          displayName?: string
          properties?: {
            Account?: { $value?: string }
            Mail?: { $value?: string }
            Description?: { $value?: string }
          }
        }>
      }>(
        `${this.baseUrl}/_apis/identities?searchFilter=General&filterValue=${encodeURIComponent(q)}&queryMembership=None&api-version=${apiVersion}`,
      )

      const people = (payload.value ?? []).map((row) => {
        const props = row.properties as Record<string, { $value?: string }> | undefined
        const uniqueName =
          props?.Account?.$value || props?.Mail?.$value || props?.Description?.$value
        const directoryName = props?.DirectoryDisplayName?.$value?.trim()
        const friendly =
          [directoryName, row.displayName, row.providerDisplayName].find(
            (value) => value?.trim() && !value.includes('\\') && !/^[^\s@]+@[^\s@]+$/.test(value),
          ) ||
          directoryName ||
          row.displayName ||
          row.providerDisplayName ||
          uniqueName ||
          'Unknown'
        return {
          id: row.id,
          displayName: friendly,
          uniqueName: uniqueName || undefined,
        } satisfies AssigneeIdentity
      })

      return this.dedupeAssignees(people)
    } catch {
      const local = await this.listAssignees()
      const needle = q.toLowerCase()
      return local.filter(
        (entry) =>
          entry.displayName.toLowerCase().includes(needle) ||
          (entry.uniqueName || '').toLowerCase().includes(needle),
      )
    }
  }

  async getBoardColumns(): Promise<BoardColumn[]> {
    try {
      const team = this.connection.team || this.connection.project
      const boards = await this.request<{ value: Array<{ id: string; name: string }> }>(
        this.api(`/${encodeURIComponent(team)}/_apis/work/boards`),
      )
      const board = boards.value?.[0]
      if (!board) return defaultColumns()

      const details = await this.request<{
        columns: Array<{
          id: string
          name: string
          itemLimit?: number
          isDone?: boolean
          stateMappings?: Record<string, string>
        }>
      }>(this.api(`/${encodeURIComponent(team)}/_apis/work/boards/${board.id}`))

      return (details.columns ?? []).map((column, index) => ({
        id: column.id,
        name: column.name,
        order: index,
        itemLimit: column.itemLimit,
        isDone: column.isDone,
        stateMappings: column.stateMappings,
      }))
    } catch {
      return defaultColumns()
    }
  }

  async listAreaPaths(): Promise<AreaPathsResult> {
    type ClassificationNode = {
      id?: number
      name?: string
      path?: string
      hasChildren?: boolean
      children?: ClassificationNode[]
    }

    const toAreaPath = (nodePath?: string, name?: string, project?: string) => {
      if (nodePath?.trim()) return nodePath.replace(/^\\+/, '').replace(/\//g, '\\')
      if (project && name) return name === project ? project : `${project}\\${name}`
      return name?.trim() || ''
    }

    const flatten = (node: ClassificationNode, project: string, out: AreaPathOption[]) => {
      const path = toAreaPath(node.path, node.name, project)
      if (path) out.push({ path, name: path })
      for (const child of node.children ?? []) flatten(child, project, out)
    }

    const project = this.connection.project
    let defaultPath: string | undefined
    let teamRoots: Array<{ value: string; includeChildren: boolean }> = []

    try {
      const team = this.connection.team || project
      const teamFields = await this.request<{
        defaultValue?: string
        values?: Array<{ value?: string; includeChildren?: boolean }>
      }>(this.api(`/${encodeURIComponent(team)}/_apis/work/teamsettings/teamfieldvalues`))
      defaultPath = teamFields.defaultValue?.trim() || undefined
      teamRoots = (teamFields.values ?? [])
        .map((entry) => ({
          value: entry.value?.trim() || '',
          includeChildren: entry.includeChildren !== false,
        }))
        .filter((entry) => entry.value)
    } catch {
      // Fall back to full classification tree.
    }

    let areas: AreaPathOption[] = []
    try {
      const root = await this.request<ClassificationNode>(
        this.api('/_apis/wit/classificationnodes/Areas?$depth=14'),
      )
      flatten(root, project, areas)
    } catch {
      areas = []
    }

    if (teamRoots.length) {
      const underTeam = areas.filter((area) => {
        const path = area.path.toLowerCase()
        return teamRoots.some((root) => {
          const prefix = root.value.toLowerCase()
          if (path === prefix) return true
          return root.includeChildren && path.startsWith(`${prefix}\\`)
        })
      })
      if (underTeam.length) areas = underTeam
    }

    if (!areas.length && project) {
      areas = [{ path: project, name: project }]
    }

    // Display root: Project\Area if present, else project, else shallowest team root.
    const byPath = new Map(areas.map((area) => [area.path.toLowerCase(), area.path]))
    const areaNode = project ? byPath.get(`${project}\\area`.toLowerCase()) : undefined
    const projectNode = project ? byPath.get(project.toLowerCase()) : undefined
    const rootPath =
      areaNode ||
      projectNode ||
      teamRoots.find((entry) => !entry.value.includes('\\'))?.value ||
      teamRoots[0]?.value ||
      project ||
      areas[0]?.path

    const relativeName = (path: string) => {
      if (!rootPath) return path
      if (path.toLowerCase() === rootPath.toLowerCase()) return 'Не указано'
      const prefix = `${rootPath}\\`
      if (path.toLowerCase().startsWith(prefix.toLowerCase())) {
        return path.slice(prefix.length)
      }
      // Also strip "Project\Area\" even if root is only Project
      if (project) {
        const areaPrefix = `${project}\\Area\\`
        if (path.toLowerCase().startsWith(areaPrefix.toLowerCase())) {
          return path.slice(areaPrefix.length)
        }
      }
      return path
    }

    if (rootPath && !areas.some((area) => area.path.toLowerCase() === rootPath.toLowerCase())) {
      areas.unshift({ path: rootPath, name: 'Не указано' })
    }

    if (!defaultPath) defaultPath = rootPath
    if (defaultPath && !areas.some((area) => area.path === defaultPath)) {
      areas.unshift({ path: defaultPath, name: relativeName(defaultPath) })
    }

    const seen = new Set<string>()
    areas = areas
      .map((area) => ({ path: area.path, name: relativeName(area.path) }))
      .filter((area) => {
        const key = area.path.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => {
        // Root (“Не указано”) first, then alphabetical by display name.
        if (rootPath && a.path.toLowerCase() === rootPath.toLowerCase()) return -1
        if (rootPath && b.path.toLowerCase() === rootPath.toLowerCase()) return 1
        return a.name.localeCompare(b.name, 'ru')
      })

    return { rootPath, defaultPath, areas }
  }

  async listIterationPaths(): Promise<IterationPathsResult> {
    type ClassificationNode = {
      name?: string
      path?: string
      children?: ClassificationNode[]
    }

    const toPath = (nodePath?: string, name?: string, projectName?: string) => {
      const raw = nodePath?.trim()
        ? nodePath.replace(/^\\+/, '').replace(/\//g, '\\')
        : projectName && name
          ? name === projectName
            ? projectName
            : `${projectName}\\${name}`
          : name?.trim() || ''
      return normalizeIterationFieldPath(raw, projectName)
    }

    const shortName = (path: string, root?: string) => {
      if (root && path.toLowerCase() === root.toLowerCase()) return path
      if (root && path.toLowerCase().startsWith(`${root.toLowerCase()}\\`)) {
        return path.slice(root.length + 1)
      }
      const parts = path.split('\\')
      return parts[parts.length - 1] || path
    }

    const project = this.connection.project
    let iterations: IterationPathOption[] = []
    let rootPath: string | undefined

    try {
      const root = await this.request<ClassificationNode>(
        this.api('/_apis/wit/classificationnodes/Iterations?$depth=14'),
      )
      rootPath = toPath(root.path, root.name, project) || project

      const walk = (node: ClassificationNode) => {
        const path = toPath(node.path, node.name, project)
        if (path && (!rootPath || path.toLowerCase() !== rootPath.toLowerCase())) {
          iterations.push({ path, name: shortName(path, rootPath) })
        }
        for (const child of node.children ?? []) walk(child)
      }
      walk(root)
    } catch {
      iterations = []
    }

    // Prefer team iterations when available (current/upcoming sprints).
    try {
      const team = this.connection.team || project
      const teamIterations = await this.request<{
        value?: Array<{ path?: string; name?: string }>
      }>(this.api(`/${encodeURIComponent(team)}/_apis/work/teamsettings/iterations`))
      const fromTeam = (teamIterations.value ?? [])
        .map((entry) => {
          const path = normalizeIterationFieldPath(entry.path, project)
          if (!path) return null
          return { path, name: entry.name?.trim() || shortName(path, rootPath) }
        })
        .filter((entry): entry is IterationPathOption => Boolean(entry))

      if (fromTeam.length) {
        const byPath = new Map(iterations.map((item) => [item.path.toLowerCase(), item]))
        for (const item of fromTeam) {
          if (!byPath.has(item.path.toLowerCase())) iterations.push(item)
        }
        const teamKeys = new Set(fromTeam.map((item) => item.path.toLowerCase()))
        iterations.sort((a, b) => {
          const aTeam = teamKeys.has(a.path.toLowerCase()) ? 0 : 1
          const bTeam = teamKeys.has(b.path.toLowerCase()) ? 0 : 1
          if (aTeam !== bTeam) return aTeam - bTeam
          return a.name.localeCompare(b.name, 'ru')
        })
      } else {
        iterations.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      }
    } catch {
      iterations.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    }

    const seen = new Set<string>()
    iterations = iterations.filter((item) => {
      const key = item.path.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return { rootPath, iterations }
  }

  async getWorkItemTypes(): Promise<WorkItemTypeInfo[]> {
    try {
      const payload = await this.request<{
        value: Array<{
          name: string
          description?: string
          color?: string
          icon?: { url?: string }
          states?: Array<{ name: string; color?: string; category?: string }>
          fields?: Array<{ referenceName: string; name: string; type: string; alwaysRequired?: boolean }>
        }>
      }>(this.api('/_apis/wit/workitemtypes'))

      return (payload.value ?? []).map((type) => ({
        name: type.name,
        description: type.description,
        color: type.color,
        icon: type.icon?.url,
        states: type.states ?? [],
        fields: (type.fields ?? []).map((field) => ({
          referenceName: field.referenceName,
          name: field.name,
          type: field.type,
          required: field.alwaysRequired,
        })),
      }))
    } catch {
      return [
        { name: 'Bug', states: [{ name: 'New' }, { name: 'Active' }, { name: 'Resolved' }, { name: 'Closed' }], fields: [] },
        { name: 'Task', states: [{ name: 'To Do' }, { name: 'In Progress' }, { name: 'Done' }], fields: [] },
        { name: 'User Story', states: [{ name: 'New' }, { name: 'Active' }, { name: 'Resolved' }, { name: 'Closed' }], fields: [] },
      ]
    }
  }
}

function defaultColumns(): BoardColumn[] {
  return [
    { id: 'new', name: 'New', order: 0 },
    { id: 'active', name: 'Active', order: 1 },
    { id: 'resolved', name: 'Resolved', order: 2 },
    { id: 'closed', name: 'Closed', order: 3 },
  ]
}

export function createDemoWorkItems(): WorkItem[] {
  const now = Date.now()
  return [
    {
      id: 101,
      rev: 1,
      title: 'Fix login timeout on VPN',
      type: 'Bug',
      state: 'Active',
      boardColumn: 'Active',
      assignedTo: 'You',
      createdBy: 'Alex Petrov',
      tags: ['auth', 'vpn'],
      changedDate: new Date(now - 3600000).toISOString(),
      createdDate: new Date(now - 86400000).toISOString(),
      description: '<p>Users lose session after 5 minutes on corporate VPN.</p>',
      priority: 1,
    },
    {
      id: 102,
      rev: 3,
      title: 'Add quick create shortcut',
      type: 'Task',
      state: 'New',
      boardColumn: 'New',
      assignedTo: 'You',
      createdBy: 'You',
      tags: ['ux'],
      changedDate: new Date(now - 7200000).toISOString(),
      createdDate: new Date(now - 172800000).toISOString(),
      description: '<p>Global hotkey should open create dialog instantly.</p>',
      priority: 2,
    },
    {
      id: 103,
      rev: 2,
      title: 'Kanban card polish',
      type: 'User Story',
      state: 'Resolved',
      boardColumn: 'Resolved',
      assignedTo: 'Alex',
      createdBy: 'Maria Ivanova',
      tags: ['board'],
      changedDate: new Date(now - 10800000).toISOString(),
      createdDate: new Date(now - 259200000).toISOString(),
      description: '<p>Compact cards with type color and assignee.</p>',
    },
    {
      id: 104,
      rev: 1,
      title: 'Paste screenshot into discussion',
      type: 'Task',
      state: 'Active',
      boardColumn: 'Active',
      assignedTo: 'You',
      createdBy: 'You',
      tags: ['attachments'],
      changedDate: new Date(now - 1800000).toISOString(),
      createdDate: new Date(now - 43200000).toISOString(),
      description: '<p>Ctrl+V should upload clipboard image as attachment.</p>',
    },
  ]
}
