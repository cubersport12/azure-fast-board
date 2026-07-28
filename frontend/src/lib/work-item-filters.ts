import type { WorkItem } from '../../shared/types'

export interface WorkItemFilters {
  types: string[]
  states: string[]
  assignees: string[]
  tags: string[]
}

/** Sentinel value for “current user” in the Assignee filter. */
export const ME_ASSIGNEE = 'Me'

export const EMPTY_FILTERS: WorkItemFilters = {
  types: [],
  states: [],
  assignees: [],
  tags: [],
}

export const DEFAULT_FILTERS: WorkItemFilters = {
  types: ['Bug', 'Task'],
  states: ['Approved', 'New', 'To Do'],
  assignees: [ME_ASSIGNEE],
  tags: [],
}

function normalizeIdentity(value: string) {
  const raw = value.trim().toLowerCase()
  const afterDomain = raw.includes('\\') ? raw.slice(raw.lastIndexOf('\\') + 1) : raw
  const local = afterDomain.includes('@') ? afterDomain.slice(0, afterDomain.indexOf('@')) : afterDomain
  return { raw, local }
}

export function isAssignedToMe(item: WorkItem, username?: string | null) {
  if (!username?.trim() || !item.assignedTo) return false
  const me = normalizeIdentity(username)
  const candidates = [item.assignedToUniqueName, item.assignedTo].filter(Boolean) as string[]
  return candidates.some((candidate) => {
    const n = normalizeIdentity(candidate)
    return n.raw === me.raw || n.local === me.local
  })
}

export function uniqueOptions(items: WorkItem[]) {
  const types = new Set<string>()
  const states = new Set<string>()
  const assignees = new Set<string>()
  const tags = new Set<string>()

  for (const item of items) {
    if (item.type) types.add(item.type)
    if (item.state) states.add(item.state)
    if (item.assignedTo) assignees.add(item.assignedTo)
    for (const tag of item.tags) tags.add(tag)
  }

  return {
    types: [...types].sort(),
    states: [...states].sort(),
    assignees: [...assignees].sort(),
    tags: [...tags].sort(),
  }
}

export function applyWorkItemFilters(
  items: WorkItem[],
  search: string,
  filters: WorkItemFilters,
  currentUsername?: string | null,
) {
  const q = search.trim().toLowerCase()

  return items.filter((item) => {
    if (filters.types.length && !filters.types.includes(item.type)) return false
    if (filters.states.length && !filters.states.includes(item.state)) return false
    if (filters.assignees.length) {
      const wantsMe = filters.assignees.includes(ME_ASSIGNEE)
      const named = filters.assignees.filter((entry) => entry !== ME_ASSIGNEE)
      const assignee = item.assignedTo || 'Unassigned'
      const matchNamed = named.includes(assignee)
      const matchMe = wantsMe && isAssignedToMe(item, currentUsername)
      if (!matchNamed && !matchMe) return false
    }
    if (filters.tags.length && !filters.tags.some((tag) => item.tags.includes(tag))) return false

    if (!q) return true
    return [item.title, item.type, item.state, item.assignedTo, String(item.id), ...item.tags]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q)
  })
}

function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((entry) => set.has(entry))
}

export function filtersEqual(a: WorkItemFilters, b: WorkItemFilters) {
  return (
    sameSet(a.types, b.types) &&
    sameSet(a.states, b.states) &&
    sameSet(a.assignees, b.assignees) &&
    sameSet(a.tags, b.tags)
  )
}

export function hasActiveFilters(filters: WorkItemFilters) {
  return !filtersEqual(filters, DEFAULT_FILTERS)
}
