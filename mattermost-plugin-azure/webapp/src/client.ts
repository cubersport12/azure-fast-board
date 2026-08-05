import { PLUGIN_ID } from './manifest';

const base = () => `/plugins/${PLUGIN_ID}/api/v1`;

function csrfHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
  };
  const match = document.cookie.match(/(?:^|;\s*)MMCSRF=([^;]+)/);
  if (match?.[1]) {
    headers['X-CSRF-Token'] = decodeURIComponent(match[1]);
  }
  return headers;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  const csrf = csrfHeaders();
  for (const [k, v] of Object.entries(csrf)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  // Let the browser set multipart boundary when body is FormData.
  if (init?.body instanceof FormData) {
    headers.delete('Content-Type');
  }

  const res = await fetch(`${base()}${path}`, {
    credentials: 'same-origin',
    ...init,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as { error?: string }).error ||
      (typeof data === 'string' ? data : '') ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export type StatusResponse = {
  connected: boolean;
  serverUrl?: string;
  collection?: string;
  project?: string;
  team?: string;
  username?: string;
};

export type PathOption = { path: string; name: string };
export type Assignee = { displayName: string; uniqueName: string };

export type MetaResponse = {
  areas: PathOption[];
  iterations: PathOption[];
  assignees: Assignee[];
};

export function getStatus() {
  return api<StatusResponse>('/status');
}

export function getMeta() {
  return api<MetaResponse>('/meta');
}

export function searchAssignees(q: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  return api<{ items: Assignee[] }>(`/assignees${qs}`);
}

export type CreatePayload = {
  type: string;
  title: string;
  body: string;
  areaPath: string;
  iterationPath: string;
  assignedTo: string;
  tags: string;
  channelId: string;
  rootId: string;
  files: File[];
  /** Parallel to files: blob: URLs from TipTap to replace with ADO attachment URLs. */
  blobSrcs: string[];
};

export function createWorkItem(payload: CreatePayload) {
  const form = new FormData();
  form.append('type', payload.type);
  form.append('title', payload.title);
  form.append('body', payload.body);
  form.append('areaPath', payload.areaPath);
  form.append('iterationPath', payload.iterationPath);
  form.append('assignedTo', payload.assignedTo);
  form.append('tags', payload.tags);
  form.append('channelId', payload.channelId);
  form.append('rootId', payload.rootId);
  form.append('blobSrcs', JSON.stringify(payload.blobSrcs || []));
  for (const file of payload.files) {
    form.append('files', file, file.name);
  }
  return api<{ id: number; url: string; title: string; type: string }>('/workitems', {
    method: 'POST',
    body: form,
  });
}

export type NamedOption = { name: string; id?: string };

export type LoginDefaults = {
  serverUrl?: string;
  username?: string;
  insecureTls?: boolean;
};

export function getLoginDefaults() {
  return api<LoginDefaults>('/login/defaults');
}

export type LoginPayload = {
  serverUrl: string;
  username: string;
  password: string;
  insecureTls: boolean;
  pendingType: string;
  pendingTitle: string;
  channelId: string;
  rootId: string;
};

export type LoginResponse = {
  collections: NamedOption[];
  projects: NamedOption[];
  teams: NamedOption[];
  collection?: string;
  project?: string;
  team?: string;
  serverUrl?: string;
};

export function loginAzure(payload: LoginPayload) {
  return api<LoginResponse>('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function setupMeta(collection: string, project: string) {
  const qs = new URLSearchParams();
  if (collection) qs.set('collection', collection);
  if (project) qs.set('project', project);
  const q = qs.toString();
  return api<{
    projects: NamedOption[];
    teams: NamedOption[];
    collection?: string;
    project?: string;
    team?: string;
  }>(`/setup/meta${q ? `?${q}` : ''}`);
}

export function saveSetup(payload: { collection: string; project: string; team: string }) {
  return api<{
    ok: boolean;
    pendingType?: string;
    pendingTitle?: string;
    channelId?: string;
    rootId?: string;
  }>('/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
