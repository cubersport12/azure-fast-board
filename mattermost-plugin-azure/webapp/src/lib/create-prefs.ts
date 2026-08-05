import { PLUGIN_ID } from '../manifest';

export type CreatePrefs = {
  areaPath?: string;
  iterationPath?: string;
  assignedTo?: string;
};

function key(project: string) {
  return `${PLUGIN_ID}:createPrefs:${project || '_'}`;
}

export function loadCreatePrefs(project: string): CreatePrefs {
  try {
    const raw = localStorage.getItem(key(project));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CreatePrefs;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCreatePrefs(project: string, prefs: CreatePrefs) {
  try {
    localStorage.setItem(
      key(project),
      JSON.stringify({
        areaPath: prefs.areaPath ?? '',
        iterationPath: prefs.iterationPath ?? '',
        assignedTo: prefs.assignedTo ?? '',
      }),
    );
  } catch {
    // quota / private mode — ignore
  }
}

/**
 * Restore a saved field. Empty string is a real choice («Не указано»).
 * Missing key / no storage → «Не указано». Stale value not in options → «Не указано».
 */
export function resolvePref(
  prefs: CreatePrefs,
  field: keyof CreatePrefs,
  options: { value: string }[],
): string {
  if (!Object.prototype.hasOwnProperty.call(prefs, field)) {
    return '';
  }
  const saved = String(prefs[field] ?? '');
  if (saved === '') {
    return '';
  }
  if (options.some((o) => o.value === saved)) {
    return saved;
  }
  return '';
}
