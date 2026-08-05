import React, { useEffect, useRef, useState } from 'react';
import {
  getLoginDefaults,
  loginAzure,
  saveSetup,
  setupMeta,
  type NamedOption,
} from '../client';
import { attachModalFocusGuard } from '../lib/modal-focus';
import { SelectField, type SelectOption } from './SelectField';

export type LoginConnected = {
  pendingType: string;
  pendingTitle: string;
  channelId: string;
  rootId: string;
};

export type LoginModalProps = {
  pendingType: string;
  pendingTitle: string;
  channelId: string;
  rootId: string;
  onClose: () => void;
  onConnected: (info: LoginConnected) => void;
};

function toSelectOptions(items: NamedOption[]): SelectOption[] {
  return (items || []).map((i) => ({
    value: i.name,
    label: i.name,
  }));
}

export function LoginModal({
  pendingType,
  pendingTitle,
  channelId,
  rootId,
  onClose,
  onConnected,
}: LoginModalProps) {
  const [step, setStep] = useState<'auth' | 'setup'>('auth');
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [insecureTls, setInsecureTls] = useState(false);
  const [collections, setCollections] = useState<SelectOption[]>([]);
  const [projects, setProjects] = useState<SelectOption[]>([]);
  const [teams, setTeams] = useState<SelectOption[]>([]);
  const [collection, setCollection] = useState('');
  const [project, setProject] = useState('');
  const [team, setTeam] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => attachModalFocusGuard(modalRef.current), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const defaults = await getLoginDefaults();
        if (cancelled) return;
        setServerUrl(defaults.serverUrl || '');
        setUsername(defaults.username || '');
        setInsecureTls(!!defaults.insecureTls);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applySetupLists = (meta: {
    projects: NamedOption[];
    teams: NamedOption[];
    project?: string;
    team?: string;
  }) => {
    setProjects(toSelectOptions(meta.projects));
    setTeams(toSelectOptions(meta.teams));
    setProject(meta.project || meta.projects?.[0]?.name || '');
    setTeam(meta.team || meta.teams?.[0]?.name || meta.project || '');
  };

  const onCollectionChange = async (value: string) => {
    setCollection(value);
    setBusy(true);
    setError('');
    try {
      applySetupLists(await setupMeta(value, ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onProjectChange = async (value: string) => {
    setProject(value);
    setBusy(true);
    setError('');
    try {
      const meta = await setupMeta(collection, value);
      setTeams(toSelectOptions(meta.teams));
      setTeam(meta.team || meta.teams?.[0]?.name || value);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await loginAzure({
        serverUrl: serverUrl.trim(),
        username: username.trim(),
        password,
        insecureTls,
        pendingType,
        pendingTitle,
        channelId,
        rootId,
      });
      setCollections(toSelectOptions(res.collections));
      setCollection(res.collection || res.collections?.[0]?.name || '');
      applySetupLists(res);
      setPassword('');
      setStep('setup');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onSaveSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await saveSetup({ collection, project, team });
      onConnected({
        pendingType: res.pendingType || '',
        pendingTitle: res.pendingTitle || '',
        channelId: res.channelId || channelId,
        rootId: res.rootId || rootId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="ado-modal-backdrop"
      onClick={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      onKeyPress={(e) => e.stopPropagation()}
    >
      <div
        ref={modalRef}
        className="ado-modal ado-modal-narrow"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="ado-modal-header">
          <h2>{step === 'auth' ? 'Вход в Azure DevOps' : 'Настройка подключения'}</h2>
          <button type="button" className="ado-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {loading ? (
          <div className="ado-modal-body">Загрузка…</div>
        ) : step === 'auth' ? (
          <form className="ado-modal-body" onSubmit={onLogin}>
            {error ? <div className="ado-error">{error}</div> : null}
            <div className="ado-field">
              <label>URL сервера</label>
              <input
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://devops.company.local/tfs"
                autoFocus
                required
              />
            </div>
            <div className="ado-field">
              <label>Логин (DOMAIN\user)</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="CORP\ivanov"
                required
              />
            </div>
            <div className="ado-field">
              <label>Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <label className="ado-check">
              <input
                type="checkbox"
                checked={insecureTls}
                onChange={(e) => setInsecureTls(e.target.checked)}
              />
              Небезопасный TLS
            </label>
            <div className="ado-actions">
              <button type="button" className="ado-btn-secondary" onClick={onClose}>
                Отмена
              </button>
              <button type="submit" className="ado-btn-primary" disabled={busy}>
                {busy ? 'Вход…' : 'Войти'}
              </button>
            </div>
          </form>
        ) : (
          <form className="ado-modal-body" onSubmit={onSaveSetup}>
            {error ? <div className="ado-error">{error}</div> : null}
            <SelectField
              label="Коллекция"
              value={collection}
              options={collections}
              onChange={(v) => void onCollectionChange(v)}
            />
            <SelectField
              label="Проект"
              value={project}
              options={projects}
              onChange={(v) => void onProjectChange(v)}
            />
            <SelectField
              label="Команда"
              value={team}
              options={teams}
              onChange={setTeam}
            />
            <div className="ado-actions">
              <button
                type="button"
                className="ado-btn-secondary"
                onClick={() => {
                  setStep('auth');
                  setError('');
                }}
                disabled={busy}
              >
                Назад
              </button>
              <button
                type="submit"
                className="ado-btn-primary"
                disabled={busy || !collection || !project || !team}
              >
                {busy ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
