import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, Input, Label } from '@/components/ui/primitives'
import { queryKeys, useConnection, useSettings } from '@/hooks/use-azure'
import { useConnectionGate } from '@/hooks/use-connection-gate'
import { requireAzureApi } from '@/lib/azure-api'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui-store'
import {
  DEFAULT_CONNECTION,
  type AuthMethod,
  type NamedEntity,
} from '../../../shared/types'

type WizardStep = 1 | 2

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

function StepIndicator({ step }: { step: WizardStep }) {
  return (
    <div className="mb-4 flex items-center gap-2 text-xs">
      <span
        className={cn(
          'rounded-full px-2.5 py-1 font-medium',
          step === 1
            ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
        )}
      >
        1. Вход
      </span>
      <span className="text-slate-300 dark:text-slate-600">→</span>
      <span
        className={cn(
          'rounded-full px-2.5 py-1 font-medium',
          step === 2
            ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
        )}
      >
        2. Проект и команда
      </span>
    </div>
  )
}

export function ConnectionDialog() {
  const open = useUiStore((s) => s.connectionOpen)
  const setOpen = useUiStore((s) => s.setConnectionOpen)
  const { data } = useConnection()
  const { data: settings } = useSettings()
  const { ready, blocked, errorMessage } = useConnectionGate()
  const qc = useQueryClient()
  const required = blocked || !ready

  const [step, setStep] = useState<WizardStep>(1)
  const [serverUrl, setServerUrl] = useState(DEFAULT_CONNECTION.serverUrl)
  const [collection, setCollection] = useState('')
  const [project, setProject] = useState('')
  const [team, setTeam] = useState('')
  // PAT UI is commented out; password/NTLM is the only method.
  const [authMethod] = useState<AuthMethod>('password')
  // const [pat, setPat] = useState('')
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
  const [sessionAuthed, setSessionAuthed] = useState(false)

  useEffect(() => {
    if (!open) return
    if (data) {
      setServerUrl(data.serverUrl)
      setCollection(data.collection)
      setProject(data.project)
      setTeam(data.team)
      setApiVersion(data.apiVersion)
      setUsername(data.username || '')
      // setAuthMethod(data.authMethod || 'password')
    }
    if (settings) setInsecureTls(settings.insecureTls)
    if (errorMessage) setMessage(errorMessage)
  }, [open, data, settings, errorMessage])

  useEffect(() => {
    if (!open) return
    if (ready) {
      setStep(2)
      setSessionAuthed(true)
    } else {
      setStep(1)
      setSessionAuthed(false)
      setPassword('')
      setCollections([])
      setProjects([])
      setTeams([])
    }
  }, [open, ready])

  useEffect(() => {
    if (!open || !ready || !data?.serverUrl) return
    let cancelled = false
    void (async () => {
      setBusy(true)
      setLoadingStep('collections')
      try {
        const result = await requireAzureApi().listCollections({
          serverUrl: data.serverUrl.trim(),
          apiVersion: data.apiVersion,
          insecureTls: settings?.insecureTls,
          username: data.username,
          authMethod: data.authMethod || 'password',
        })
        if (cancelled) return
        setCollections(result.collections)
        setApiVersion(result.apiVersion)
        setServerUrl(result.serverUrl)
        const preferred =
          result.collections.find((entry) => entry.name === data.collection)?.name ||
          result.collections[0]?.name ||
          ''
        setCollection(preferred)
        if (preferred) {
          const projectList = await requireAzureApi().listProjects({
            serverUrl: result.serverUrl.trim(),
            collection: preferred,
            apiVersion: result.apiVersion,
            insecureTls: settings?.insecureTls,
            username: data.username,
            authMethod: data.authMethod || 'password',
          })
          if (cancelled) return
          setProjects(projectList)
          const nextProject =
            projectList.find((entry) => entry.name === data.project)?.name ||
            projectList[0]?.name ||
            ''
          setProject(nextProject)
          if (nextProject) {
            const teamList = await requireAzureApi().listTeams({
              serverUrl: result.serverUrl.trim(),
              collection: preferred,
              project: nextProject,
              apiVersion: result.apiVersion,
              insecureTls: settings?.insecureTls,
              username: data.username,
              authMethod: data.authMethod || 'password',
            })
            if (cancelled) return
            setTeams(teamList)
            setTeam(
              teamList.find((entry) => entry.name === data.team)?.name ||
                teamList[0]?.name ||
                '',
            )
            setMessage(`Готово · ${teamList.length} команд`)
          }
        }
      } catch (error) {
        if (!cancelled) setMessage(cleanInvokeError(error))
      } finally {
        if (!cancelled) {
          setBusy(false)
          setLoadingStep('idle')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, ready, data?.serverUrl, data?.collection, data?.project, data?.team, data?.apiVersion, data?.username, data?.authMethod, settings?.insecureTls])

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
    // pat: authMethod === 'pat' ? pat.trim() : undefined,
    password: password || undefined,
  })

  /** Fresh login needs password; already-connected step 2 can use stored secret. */
  const canLogin =
    Boolean(serverUrl.trim()) && Boolean(username.trim() && password)
  const canUseStored = ready || sessionAuthed
  const canLoadLists = Boolean(serverUrl.trim()) && (canLogin || canUseStored)

  const loadCollections = async (opts?: { advanceOnSuccess?: boolean }) => {
    if (!canLoadLists) {
      setMessage('Укажите URL сервера, имя пользователя и пароль')
      return false
    }
    setBusy(true)
    setLoadingStep('collections')
    setMessage(null)
    setProjects([])
    setTeams([])
    try {
      if (insecureTls) await persistTls(true)
      const result = await requireAzureApi().listCollections(credsBase())
      setCollections(result.collections)
      setApiVersion(result.apiVersion)
      setServerUrl(result.serverUrl)
      setSessionAuthed(true)
      setMessage(`Вход выполнен · ${result.collections.length} коллекций · API ${result.apiVersion}`)

      const preferred =
        result.collections.find((entry) => entry.name === collection)?.name ||
        result.collections[0]?.name ||
        ''
      setCollection(preferred)
      if (preferred) {
        await loadProjects(result.serverUrl, preferred, result.apiVersion)
      }
      if (opts?.advanceOnSuccess) setStep(2)
      return true
    } catch (error) {
      setCollections([])
      const text = cleanInvokeError(error)
      setMessage(text)
      if (/certificate|CERT_|UNABLE_TO_VERIFY|SSL|TLS|fetch failed/i.test(text) && !insecureTls) {
        setMessage(
          `${text}\n\nПохоже на корпоративный SSL-сертификат. Включите «Разрешить небезопасный TLS» ниже и нажмите «Войти» снова.`,
        )
      }
      return false
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
    if (!nextCollection || !canLoadLists) return
    setBusy(true)
    setLoadingStep('projects')
    setTeams([])
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
    if (!nextCollection || !nextProject || !canLoadLists) return
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

  const login = async () => {
    if (!canLogin) {
      setMessage('Укажите URL сервера, имя пользователя и пароль')
      return
    }
    await loadCollections({ advanceOnSuccess: true })
  }

  const save = async () => {
    if (!collection || !project || !canLoadLists) return
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
        // pat: authMethod === 'pat' ? pat.trim() : undefined,
        password: password || undefined,
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

  const disconnect = async () => {
    setBusy(true)
    try {
      await requireAzureApi().clearConnection()
      useUiStore.getState().setConnectionReady(false)
      await qc.invalidateQueries({ queryKey: queryKeys.connection })
      await qc.invalidateQueries({ queryKey: [...queryKeys.connection, 'verify'] })
      await qc.invalidateQueries({ queryKey: queryKeys.workItems })
      setSessionAuthed(false)
      setPassword('')
      setCollections([])
      setProjects([])
      setTeams([])
      setCollection('')
      setProject('')
      setTeam('')
      setMessage(null)
      setStep(1)
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
      <StepIndicator step={step} />

      {step === 1 && (
        <div className="grid gap-3">
          <div className="space-y-1">
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
                setSessionAuthed(false)
              }}
              placeholder="https://devops.company.local/tfs"
            />
          </div>

          {/*
          <div className="space-y-1">
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
          */}

          <div className="space-y-1">
            <Label htmlFor="conn-username">Имя пользователя</Label>
            <Input
              id="conn-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="DOMAIN\user или email"
              autoComplete="username"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="conn-password">Пароль</Label>
            <Input
              id="conn-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль домена"
              autoComplete="current-password"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void login()
              }}
            />
            <p className="text-[11px] text-slate-500">
              Windows NTLM (DOMAIN\user + пароль). Лучше DOMAIN\samAccountName, а не email.
            </p>
          </div>

          {/*
          {authMethod === 'pat' && (
            <div className="space-y-1">
              <Label htmlFor="conn-pat">Personal Access Token</Label>
              <Input
                id="conn-pat"
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value.replace(/\s+/g, ''))}
                placeholder="Сырой PAT (не Base64)"
                autoComplete="off"
              />
            </div>
          )}
          */}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={insecureTls}
              onChange={(e) => void persistTls(e.target.checked)}
            />
            Разрешить небезопасный TLS (корпоративные / самоподписанные сертификаты)
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="text-slate-700 dark:text-slate-200">{serverUrl}</div>
            <div className="text-[11px] text-slate-500">
              {username || '—'} · API {apiVersion}
            </div>
          </div>

          <SelectField
            id="conn-collection"
            label="Коллекция"
            value={collection}
            options={collections}
            placeholder={collections.length ? 'Выберите коллекцию' : 'Загрузка…'}
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

          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={insecureTls}
              onChange={(e) => void persistTls(e.target.checked)}
            />
            Разрешить небезопасный TLS
          </label>
        </div>
      )}

      {required && step === 1 && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Работа с доской доступна только после успешного подключения к Azure DevOps Server.
        </p>
      )}

      {message && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{message}</p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        {step === 1 && (
          <Button disabled={!canLogin || busy} onClick={() => void login()}>
            {loadingStep === 'collections' ? 'Вход…' : 'Войти'}
          </Button>
        )}

        {step === 2 && (
          <>
            {ready && (
              <Button variant="ghost" disabled={busy} onClick={() => void disconnect()}>
                Отключить
              </Button>
            )}
            {!ready && (
              <Button variant="outline" disabled={busy} onClick={() => setStep(1)}>
                Назад
              </Button>
            )}
            <Button
              disabled={!canLoadLists || !collection || !project || busy}
              onClick={() => void save()}
            >
              {busy && loadingStep === 'idle' ? 'Проверка…' : 'Сохранить'}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  )
}
