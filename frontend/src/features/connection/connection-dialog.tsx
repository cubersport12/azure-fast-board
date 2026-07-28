import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, Input, Label } from '@/components/ui/primitives'
import { queryKeys, useConnection, useSettings } from '@/hooks/use-azure'
import { useConnectionGate } from '@/hooks/use-connection-gate'
import { requireAzureApi } from '@/lib/azure-api'
import { useUiStore } from '@/stores/ui-store'
import {
  DEFAULT_CONNECTION,
  type AuthMethod,
  type NamedEntity,
} from '../../../shared/types'

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder,
}: {
  id: string
  label: string
  value: string
  options: NamedEntity[]
  onChange: (value: string) => void
  disabled?: boolean
  placeholder: string
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900 dark:disabled:text-slate-500"
        value={value}
        disabled={disabled || options.length === 0}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((entry) => (
          <option key={entry.id} value={entry.name}>
            {entry.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function cleanInvokeError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']+':\s*/i, '')
}

export function ConnectionDialog() {
  const open = useUiStore((s) => s.connectionOpen)
  const setOpen = useUiStore((s) => s.setConnectionOpen)
  const { data } = useConnection()
  const { data: settings } = useSettings()
  const { ready, blocked, errorMessage } = useConnectionGate()
  const qc = useQueryClient()
  const required = blocked || !ready

  const [serverUrl, setServerUrl] = useState(DEFAULT_CONNECTION.serverUrl)
  const [collection, setCollection] = useState('')
  const [project, setProject] = useState('')
  const [team, setTeam] = useState('')
  const [authMethod, setAuthMethod] = useState<AuthMethod>('password')
  const [pat, setPat] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [apiVersion, setApiVersion] = useState('7.0')
  const [insecureTls, setInsecureTls] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [collections, setCollections] = useState<NamedEntity[]>([])
  const [projects, setProjects] = useState<NamedEntity[]>([])
  const [teams, setTeams] = useState<NamedEntity[]>([])
  const [busy, setBusy] = useState(false)
  const [loadingStep, setLoadingStep] = useState<'idle' | 'collections' | 'projects' | 'teams'>('idle')

  useEffect(() => {
    if (!open) return
    if (data) {
      setServerUrl(data.serverUrl)
      setCollection(data.collection)
      setProject(data.project)
      setTeam(data.team)
      setApiVersion(data.apiVersion)
      setUsername(data.username || '')
      setAuthMethod(data.authMethod || 'password')
    }
    if (settings) setInsecureTls(settings.insecureTls)
    if (errorMessage) setMessage(errorMessage)
  }, [open, data, settings, errorMessage])

  const persistTls = async (enabled: boolean) => {
    setInsecureTls(enabled)
    await requireAzureApi().updateSettings({ insecureTls: enabled })
    await qc.invalidateQueries({ queryKey: queryKeys.settings })
  }

  const credsBase = () => ({
    serverUrl: serverUrl.trim(),
    apiVersion,
    insecureTls,
    username: username.trim() || undefined,
    authMethod,
    pat: authMethod === 'pat' ? pat.trim() : undefined,
    password: authMethod === 'password' ? password : undefined,
  })

  const canLoad =
    Boolean(serverUrl.trim()) &&
    (authMethod === 'pat'
      ? Boolean(pat.trim())
      : Boolean(username.trim() && password))

  const loadCollections = async () => {
    if (!canLoad) {
      setMessage(
        authMethod === 'password'
          ? 'Укажите URL сервера, имя пользователя и пароль'
          : 'Укажите URL сервера и PAT',
      )
      return
    }
    setBusy(true)
    setLoadingStep('collections')
    setMessage(null)
    setProjects([])
    setTeams([])
    setProject('')
    setTeam('')
    try {
      if (insecureTls) await persistTls(true)
      const result = await requireAzureApi().listCollections(credsBase())
      setCollections(result.collections)
      setApiVersion(result.apiVersion)
      setServerUrl(result.serverUrl)
      setMessage(`Загружено ${result.collections.length} коллекций · API ${result.apiVersion}`)

      const preferred =
        result.collections.find((entry) => entry.name === collection)?.name ||
        result.collections[0]?.name ||
        ''
      setCollection(preferred)
      if (preferred) {
        await loadProjects(result.serverUrl, preferred, result.apiVersion)
      }
    } catch (error) {
      setCollections([])
      const text = cleanInvokeError(error)
      setMessage(text)
      if (/certificate|CERT_|UNABLE_TO_VERIFY|SSL|TLS|fetch failed/i.test(text) && !insecureTls) {
        setMessage(
          `${text}\n\nПохоже на корпоративный SSL-сертификат. Включите «Разрешить небезопасный TLS» ниже и нажмите «Загрузить» снова.`,
        )
      }
    } finally {
      setBusy(false)
      setLoadingStep('idle')
    }
  }

  const loadProjects = async (
    nextServerUrl = serverUrl,
    nextCollection = collection,
    nextApiVersion = apiVersion,
  ) => {
    if (!nextCollection || !canLoad) return
    setBusy(true)
    setLoadingStep('projects')
    setTeams([])
    setTeam('')
    try {
      const list = await requireAzureApi().listProjects({
        ...credsBase(),
        serverUrl: nextServerUrl.trim(),
        collection: nextCollection,
        apiVersion: nextApiVersion,
      })
      setProjects(list)
      const preferred = list.find((entry) => entry.name === project)?.name || list[0]?.name || ''
      setProject(preferred)
      setMessage(`Загружено ${list.length} проектов`)
      if (preferred) {
        await loadTeams(nextServerUrl, nextCollection, preferred, nextApiVersion)
      }
    } catch (error) {
      setProjects([])
      setMessage(cleanInvokeError(error))
    } finally {
      setBusy(false)
      setLoadingStep('idle')
    }
  }

  const loadTeams = async (
    nextServerUrl = serverUrl,
    nextCollection = collection,
    nextProject = project,
    nextApiVersion = apiVersion,
  ) => {
    if (!nextCollection || !nextProject || !canLoad) return
    setBusy(true)
    setLoadingStep('teams')
    try {
      const list = await requireAzureApi().listTeams({
        ...credsBase(),
        serverUrl: nextServerUrl.trim(),
        collection: nextCollection,
        project: nextProject,
        apiVersion: nextApiVersion,
      })
      setTeams(list)
      const preferred = list.find((entry) => entry.name === team)?.name || list[0]?.name || ''
      setTeam(preferred)
      setMessage(`Готово · ${list.length} команд`)
    } catch (error) {
      setTeams([])
      setMessage(cleanInvokeError(error))
    } finally {
      setBusy(false)
      setLoadingStep('idle')
    }
  }

  const save = async () => {
    if (!collection || !project || !canLoad) return
    setBusy(true)
    setMessage(null)
    try {
      await persistTls(insecureTls)
      await requireAzureApi().saveConnection({
        serverUrl: serverUrl.trim(),
        collection,
        project,
        team,
        apiVersion,
        username: username.trim() || undefined,
        authMethod,
        pat: authMethod === 'pat' ? pat.trim() : undefined,
        password: authMethod === 'password' ? password : undefined,
      })
      await requireAzureApi().verifyConnection()
      await qc.invalidateQueries({ queryKey: queryKeys.connection })
      await qc.invalidateQueries({ queryKey: [...queryKeys.connection, 'verify'] })
      await qc.invalidateQueries({ queryKey: queryKeys.workItems })
      await qc.invalidateQueries({ queryKey: queryKeys.columns })
      await qc.invalidateQueries({ queryKey: queryKeys.types })
      await qc.invalidateQueries({ queryKey: queryKeys.assignees })
      await qc.invalidateQueries({ queryKey: queryKeys.currentUser })
      await qc.invalidateQueries({ queryKey: queryKeys.areaPaths })
      useUiStore.getState().setConnectionReady(true)
      useUiStore.getState().setSyncStatus({ state: 'idle', message: 'Подключено' })
      setOpen(false)
    } catch (error) {
      setMessage(cleanInvokeError(error))
    } finally {
      setBusy(false)
    }
  }

  const tryClose = () => {
    if (required) return
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onClose={tryClose}
      title="Подключение к Azure DevOps Server"
      wide
      dismissible={!required}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="conn-server">URL сервера</Label>
          <Input
            id="conn-server"
            value={serverUrl}
            onChange={(e) => {
              setServerUrl(e.target.value)
              setCollections([])
              setProjects([])
              setTeams([])
              setCollection('')
              setProject('')
              setTeam('')
            }}
            placeholder="https://devops.company.local/tfs"
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <Label>Способ входа</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={authMethod === 'password' ? 'default' : 'outline'}
              onClick={() => setAuthMethod('password')}
            >
              Логин / Пароль
            </Button>
            <Button
              type="button"
              size="sm"
              variant={authMethod === 'pat' ? 'default' : 'outline'}
              onClick={() => setAuthMethod('pat')}
            >
              PAT
            </Button>
          </div>
        </div>

        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="conn-username">Имя пользователя</Label>
          <Input
            id="conn-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="DOMAIN\user или email"
            autoComplete="username"
          />
        </div>

        {authMethod === 'password' ? (
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="conn-password">Пароль</Label>
            <div className="flex gap-2">
              <Input
                id="conn-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Пароль домена"
                className="flex-1"
                autoComplete="current-password"
              />
              <Button
                type="button"
                variant="outline"
                disabled={!canLoad || busy}
                onClick={() => void loadCollections()}
              >
                {loadingStep === 'collections' ? 'Загрузка…' : 'Загрузить'}
              </Button>
            </div>
            <p className="text-[11px] text-slate-500">
              Используется Windows NTLM (DOMAIN\user + пароль). Лучше DOMAIN\samAccountName, а не email.
            </p>
          </div>
        ) : (
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="conn-pat">Personal Access Token</Label>
            <div className="flex gap-2">
              <Input
                id="conn-pat"
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value.replace(/\s+/g, ''))}
                placeholder="PAT с правами Work Items Read & Write"
                className="flex-1"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                disabled={!canLoad || busy}
                onClick={() => void loadCollections()}
              >
                {loadingStep === 'collections' ? 'Загрузка…' : 'Загрузить'}
              </Button>
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={insecureTls}
            onChange={(e) => void persistTls(e.target.checked)}
          />
          Разрешить небезопасный TLS (корпоративные / самоподписанные сертификаты)
        </label>

        <SelectField
          id="conn-collection"
          label="Коллекция"
          value={collection}
          options={collections}
          placeholder={collections.length ? 'Выберите коллекцию' : 'Сначала загрузите с сервера'}
          disabled={busy}
          onChange={(value) => {
            setCollection(value)
            setProject('')
            setTeam('')
            setProjects([])
            setTeams([])
            if (value) void loadProjects(serverUrl, value, apiVersion)
          }}
        />

        <div className="space-y-1">
          <Label>Версия API</Label>
          <Input value={apiVersion} readOnly className="bg-slate-50 dark:bg-slate-950" />
        </div>

        <SelectField
          id="conn-project"
          label="Проект"
          value={project}
          options={projects}
          placeholder={collection ? 'Выберите проект' : 'Сначала выберите коллекцию'}
          disabled={busy || !collection}
          onChange={(value) => {
            setProject(value)
            setTeam('')
            setTeams([])
            if (value) void loadTeams(serverUrl, collection, value, apiVersion)
          }}
        />

        <SelectField
          id="conn-team"
          label="Команда"
          value={team}
          options={teams}
          placeholder={project ? 'Выберите команду' : 'Сначала выберите проект'}
          disabled={busy || !project}
          onChange={setTeam}
        />
      </div>

      {required && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Работа с доской доступна только после успешного подключения к Azure DevOps Server.
        </p>
      )}

      {message && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{message}</p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        {ready && (
          <Button
            variant="ghost"
            onClick={async () => {
              await requireAzureApi().clearConnection()
              useUiStore.getState().setConnectionReady(false)
              await qc.invalidateQueries({ queryKey: queryKeys.connection })
              await qc.invalidateQueries({ queryKey: [...queryKeys.connection, 'verify'] })
              await qc.invalidateQueries({ queryKey: queryKeys.workItems })
              setOpen(true)
            }}
          >
            Отключить
          </Button>
        )}
        <Button disabled={!canLoad || !collection || !project || busy} onClick={() => void save()}>
          {busy ? 'Проверка…' : 'Сохранить и подключить'}
        </Button>
      </div>
    </Dialog>
  )
}
