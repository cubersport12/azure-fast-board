export function parseTags(value?: string | string[]) {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  return value
    .split(';')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

/**
 * Classification nodes use `Project\Iteration\Sprint`, but System.IterationPath
 * expects `Project\Sprint` (structural "Iteration" node stripped).
 */
export function normalizeIterationFieldPath(path?: string | null, project?: string) {
  if (!path?.trim()) return ''
  let next = path.trim().replace(/^\\+/, '').replace(/\//g, '\\').replace(/\\+/g, '\\')

  const stripIteration = (value: string, root: string) => {
    const prefix = `${root}\\Iteration\\`
    if (value.toLowerCase().startsWith(prefix.toLowerCase())) {
      return `${root}\\${value.slice(prefix.length)}`
    }
    if (value.toLowerCase() === `${root}\\iteration`.toLowerCase()) return root
    return value
  }

  if (project?.trim()) {
    next = stripIteration(next, project.trim())
  } else {
    next = next.replace(/^([^\\]+)\\Iteration\\/i, '$1\\')
  }

  return next.replace(/\\+/g, '\\')
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
