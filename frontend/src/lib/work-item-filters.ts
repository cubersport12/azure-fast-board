import type { WorkItem } from '../../shared/types'

export interface WorkItemFilters {
  types: string[]
  states: string[]
  assignees: string[]
  creators: string[]
  tags: string[]
}

/** Sentinel value for “current user” in Assignee / Creator filters. */
export const ME_ASSIGNEE = 'Me'

export const EMPTY_FILTERS: WorkItemFilters = {
  types: [],
  states: [],
  assignees: [],
  creators: [],
  tags: [],
}

export const DEFAULT_FILTERS: WorkItemFilters = {
  types: ['Bug', 'Task'],
  states: ['Approved', 'New', 'To Do'],
  assignees: [ME_ASSIGNEE],
  creators: [],
  tags: [],
}

export type FilterPresetId = 'created-by-me' | 'done' | 'open'

export interface FilterPreset {
  id: FilterPresetId
  label: string
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'created-by-me', label: 'Созданные мною' },
  { id: 'done', label: 'Отработанные мною' },
  { id: 'open', label: 'Не отработанные мною' },
]

/** Common completed states; merged with whatever exists on loaded items. */
export const COMPLETED_STATES = ['Done', 'Closed', 'Resolved', 'Completed', 'Removed']

function normalizeIdentity(value: string) {
  const raw = value.trim().toLowerCase()
  const afterDomain = raw.includes('\\') ? raw.slice(raw.lastIndexOf('\\') + 1) : raw
  const local = afterDomain.includes('@') ? afterDomain.slice(0, afterDomain.indexOf('@')) : afterDomain
  return { raw, local }
}

/** Identity hints for resolving the “Я” filter (login, email, FIO). */
export type MeIdentity = {
  username?: string | null
  displayName?: string | null
  uniqueName?: string | null
} | string | null | undefined

function meCandidates(me: MeIdentity): string[] {
  if (!me) return []
  if (typeof me === 'string') return me.trim() ? [me.trim()] : []
  return [me.uniqueName, me.displayName, me.username]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
}

function identityMatches(a: string, b: string) {
  const left = normalizeIdentity(a)
  const right = normalizeIdentity(b)
  if (left.raw === right.raw || left.local === right.local) return true
  // Exact display-name match (ФИО), case-insensitive.
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true
  return false
}

function anyIdentityMatch(left: string[], right: string[]) {
  return left.some((a) => right.some((b) => identityMatches(a, b)))
}

export function isAssignedToMe(item: WorkItem, me?: MeIdentity) {
  const mine = meCandidates(me)
  if (!mine.length || !item.assignedTo) return false
  const theirs = [item.assignedToUniqueName, item.assignedTo].filter(Boolean) as string[]
  return anyIdentityMatch(theirs, mine)
}

export function isCreatedByMe(item: WorkItem, me?: MeIdentity) {
  const mine = meCandidates(me)
  if (!mine.length || !item.createdBy) return false
  const theirs = [item.createdByUniqueName, item.createdBy].filter(Boolean) as string[]
  return anyIdentityMatch(theirs, mine)
}

export function isCompletedState(state: string) {
  const value = state.trim().toLowerCase()
  if (!value) return false
  return (
    value === 'done' ||
    value === 'closed' ||
    value === 'resolved' ||
    value === 'completed' ||
    value === 'removed' ||
    value.includes('done') ||
    value.includes('closed') ||
    value.includes('resolved') ||
    value.includes('complet')
  )
}

export function uniqueOptions(items: WorkItem[]) {
  const types = new Set<string>()
  const states = new Set<string>()
  const assignees = new Set<string>()
  const creators = new Set<string>()
  const tags = new Set<string>()

  for (const item of items) {
    if (item.type) types.add(item.type)
    if (item.state) states.add(item.state)
    if (item.assignedTo) assignees.add(item.assignedTo)
    if (item.createdBy) creators.add(item.createdBy)
    for (const tag of item.tags) tags.add(tag)
  }

  return {
    types: [...types].sort(),
    states: [...states].sort(),
    assignees: [...assignees].sort(),
    creators: [...creators].sort(),
    tags: [...tags].sort(),
  }
}

/** Build concrete filter values for a preset from currently known options. */
export function filtersForPreset(
  id: FilterPresetId,
  availableStates: string[],
): WorkItemFilters {
  const states = [...new Set([...availableStates, ...COMPLETED_STATES])]
  const doneStates = states.filter(isCompletedState)
  const openStates = states.filter((state) => !isCompletedState(state))

  if (id === 'created-by-me') {
    return {
      types: [],
      states: [],
      assignees: [],
      creators: [ME_ASSIGNEE],
      tags: [],
    }
  }
  if (id === 'done') {
    return {
      types: [],
      states: doneStates.length ? doneStates : [...COMPLETED_STATES],
      assignees: [],
      creators: [ME_ASSIGNEE],
      tags: [],
    }
  }
  return {
    types: [],
    states: openStates,
    assignees: [],
    creators: [ME_ASSIGNEE],
    tags: [],
  }
}

export function matchFilterPreset(
  filters: WorkItemFilters,
  availableStates: string[],
): FilterPresetId | null {
  for (const preset of FILTER_PRESETS) {
    if (filtersEqual(filters, filtersForPreset(preset.id, availableStates))) return preset.id
  }
  return null
}

export function applyWorkItemFilters(
  items: WorkItem[],
  search: string,
  filters: WorkItemFilters,
  me?: MeIdentity,
  iterationPath?: string | null,
) {
  const q = search.trim().toLowerCase()
  const selectedIteration = iterationPath?.trim().toLowerCase() || ''

  return items.filter((item) => {
    if (selectedIteration) {
      const itemIteration = (item.iterationPath || '').toLowerCase()
      if (
        itemIteration !== selectedIteration &&
        !itemIteration.startsWith(`${selectedIteration}\\`)
      ) {
        return false
      }
    }
    if (filters.types.length && !filters.types.includes(item.type)) return false
    if (filters.states.length && !filters.states.includes(item.state)) return false

    if (filters.assignees.length) {
      const wantsMe = filters.assignees.includes(ME_ASSIGNEE)
      const named = filters.assignees.filter((entry) => entry !== ME_ASSIGNEE)
      const assignee = item.assignedTo || 'Unassigned'
      const matchNamed = named.includes(assignee)
      const matchMe = wantsMe && isAssignedToMe(item, me)
      if (!matchNamed && !matchMe) return false
    }

    if (filters.creators.length) {
      const wantsMe = filters.creators.includes(ME_ASSIGNEE)
      const named = filters.creators.filter((entry) => entry !== ME_ASSIGNEE)
      const creator = item.createdBy || ''
      const matchNamed = Boolean(creator) && named.includes(creator)
      const matchMe = wantsMe && isCreatedByMe(item, me)
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
    sameSet(a.creators ?? [], b.creators ?? []) &&
    sameSet(a.tags, b.tags)
  )
}

export function hasActiveFilters(filters: WorkItemFilters) {
  return !filtersEqual(filters, DEFAULT_FILTERS)
}
