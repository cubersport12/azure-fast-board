export function parseTags(value?: string | string[]) {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  return value
    .split(';')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

/**
 * Classification nodes use `Project\Iteration\Sprint` / `Project\Area\Team`,
 * but System.IterationPath / System.AreaPath expect the structural node stripped.
 */
function stripClassificationSegment(
  path: string,
  segment: 'Iteration' | 'Area',
  project?: string,
) {
  let next = path.trim().replace(/^\\+/, '').replace(/\//g, '\\').replace(/\\+/g, '\\')

  const strip = (value: string, root: string) => {
    const prefix = `${root}\\${segment}\\`
    if (value.toLowerCase().startsWith(prefix.toLowerCase())) {
      return `${root}\\${value.slice(prefix.length)}`
    }
    if (value.toLowerCase() === `${root}\\${segment}`.toLowerCase()) return root
    return value
  }

  if (project?.trim()) {
    next = strip(next, project.trim())
  } else {
    const re = new RegExp(`^([^\\\\]+)\\\\${segment}\\\\`, 'i')
    next = next.replace(re, '$1\\')
  }

  return next.replace(/\\+/g, '\\')
}

/**
 * Classification nodes use `Project\Iteration\Sprint`, but System.IterationPath
 * expects `Project\Sprint` (structural "Iteration" node stripped).
 */
export function normalizeIterationFieldPath(path?: string | null, project?: string) {
  if (!path?.trim()) return ''
  return stripClassificationSegment(path, 'Iteration', project)
}

/** Browser URL for a work item in Azure DevOps / TFS web UI. */
export function buildWorkItemWebUrl(
  connection: { serverUrl: string; collection: string; project: string },
  workItemId: number,
): string {
  const server = connection.serverUrl.replace(/\/+$/, '')
  const collection = connection.collection.replace(/^\/+|\/+$/g, '')
  const project = connection.project
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `${server}/${collection}/${project}/_workitems/edit/${workItemId}`
}

/** Replace last segment of an iteration field path after rename. */
export function replaceIterationPathLeaf(path: string, newName: string): string {
  const parts = path.split('\\').filter(Boolean)
  if (!parts.length) return newName.trim()
  parts[parts.length - 1] = newName.trim()
  return parts.join('\\')
}

/**
 * Classification nodes use `Project\Area\Team`, but System.AreaPath
 * expects `Project\Team` (structural "Area" node stripped).
 */
export function normalizeAreaFieldPath(path?: string | null, project?: string) {
  if (!path?.trim()) return ''
  return stripClassificationSegment(path, 'Area', project)
}

export function formatRelative(date?: string) {
  if (!date) return ''
  const value = new Date(date).getTime()
  if (Number.isNaN(value)) return ''
  const diff = Date.now() - value
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.floor(hours / 24)
  return `${days} дн назад`
}

export function workItemColor(type: string) {
  const key = type.toLowerCase()
  if (key.includes('bug')) return 'bg-rose-500'
  if (key.includes('task')) return 'bg-amber-500'
  if (key.includes('user story') || key.includes('story')) return 'bg-sky-500'
  if (key.includes('feature')) return 'bg-violet-500'
  if (key.includes('epic')) return 'bg-orange-500'
  if (key.includes('issue')) return 'bg-emerald-500'
  return 'bg-slate-500'
}
