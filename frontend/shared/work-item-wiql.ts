/** Sentinel copied from UI filters — keep in sync with work-item-filters ME_ASSIGNEE. */
export const WIQL_ME = 'Me'
export const WIQL_UNASSIGNED = 'Unassigned'

/** Filter sentinel: matches work items that have no tags at all. */
export const WIQL_TAG_NONE = '__no_tags__'

/** Notification engine (poll query + realtime filter) accepts these types only. */
export const NOTIFICATION_WORK_ITEM_TYPES = ['Bug', 'Task']

/** Unknown/missing type keeps the event — on-prem payloads sometimes omit it. */
export function isNotificationAllowedType(type?: string | null) {
  const value = type?.trim().toLowerCase()
  if (!value) return true
  return NOTIFICATION_WORK_ITEM_TYPES.some((allowed) => allowed.toLowerCase() === value)
}

export interface WorkItemListQuery {
  iterationPath?: string
  types?: string[]
  states?: string[]
  assignees?: string[]
  creators?: string[]
  tags?: string[]
  /** Poll: assigned to me or created by me (OR). */
  meOrAuthor?: boolean
}

function quote(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function inClause(field: string, values?: string[]) {
  const list = (values ?? []).map((value) => value.trim()).filter(Boolean)
  if (!list.length) return ''
  if (list.length === 1) return ` AND [${field}] = ${quote(list[0])}`
  return ` AND [${field}] IN (${list.map(quote).join(', ')})`
}

function peopleClause(field: string, values?: string[]) {
  const list = (values ?? []).map((value) => value.trim()).filter(Boolean)
  if (!list.length) return ''
  const parts = list.map((value) => {
    if (value === WIQL_ME) return `[${field}] = @Me`
    if (value === WIQL_UNASSIGNED) return `[${field}] = ''`
    return `[${field}] = ${quote(value)}`
  })
  if (parts.length === 1) return ` AND ${parts[0]}`
  return ` AND (${parts.join(' OR ')})`
}

export function buildWorkItemsWiql(query: WorkItemListQuery = {}) {
  let wiql = 'Select [System.Id] From WorkItems Where [System.TeamProject] = @project'
  const iteration = query.iterationPath?.trim()
  if (iteration) wiql += ` AND [System.IterationPath] UNDER ${quote(iteration)}`
  wiql += inClause('System.WorkItemType', query.types)
  wiql += inClause('System.State', query.states)
  if (query.meOrAuthor) {
    wiql += ' AND ([System.AssignedTo] = @Me OR [System.CreatedBy] = @Me)'
  } else {
    wiql += peopleClause('System.AssignedTo', query.assignees)
    wiql += peopleClause('System.CreatedBy', query.creators)
  }
  const tags = (query.tags ?? []).map((tag) => tag.trim()).filter(Boolean)
  // Tags is a long-text field on-prem: WIQL rejects `= ''` there, so the
  // no-tags sentinel cannot be expressed server-side. When it is requested the
  // whole tags clause is dropped (full scope) and useWorkItems filters
  // `named tags ∪ no tags` client-side.
  const namedTags = tags.filter((tag) => tag !== WIQL_TAG_NONE)
  if (namedTags.length && !tags.includes(WIQL_TAG_NONE)) {
    wiql += ` AND (${namedTags.map((tag) => `[System.Tags] CONTAINS ${quote(tag)}`).join(' OR ')})`
  }
  return `${wiql} Order By [System.ChangedDate] Desc`
}
