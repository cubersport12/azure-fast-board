import type { WorkItem } from './types'

/**
 * ADO field refs that are visible on Bug/Task cards (details page + board card).
 * An update notification is only worth showing when one of these actually changed.
 * Bookkeeping refs (System.Rev, System.ChangedDate, System.ChangedBy, System.Watermark)
 * are deliberately excluded — they change on every save and would let the filter through.
 */
export const DISPLAYED_FIELD_REFS: readonly string[] = [
  'System.Title',
  'System.WorkItemType',
  'System.State',
  'System.BoardColumn',
  'System.AssignedTo',
  'Microsoft.VSTS.Common.Priority',
  'Microsoft.VSTS.TCM.ReproSteps',
  'System.Description',
  'System.AreaPath',
  'System.IterationPath',
  'System.Tags',
]

const DISPLAYED_SET = new Set(DISPLAYED_FIELD_REFS)
const HTML_FIELD_REFS = new Set(['System.Description', 'Microsoft.VSTS.TCM.ReproSteps'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** { oldValue, newValue } delta from workitem.updated resource.fields — null for plain values. */
function fieldDelta(
  value: unknown,
): { oldValue: unknown; newValue: unknown } | null {
  if (!isRecord(value)) return null
  if (!('newValue' in value) && !('oldValue' in value)) return null
  return { oldValue: value.oldValue, newValue: value.newValue }
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeIdentity(value: unknown): string {
  if (!value) return ''
  if (isRecord(value)) {
    const name = typeof value.displayName === 'string' ? value.displayName : ''
    const unique = typeof value.uniqueName === 'string' ? value.uniqueName : ''
    return `${name}|${unique}`.toLowerCase()
  }
  const text = String(value)
  const angle = text.match(/<([^>]+)>/)
  const name = angle ? text.slice(0, angle.index).trim() : text.trim()
  const unique = angle ? angle[1].trim() : ''
  return `${name}|${unique}`.toLowerCase()
}

/** Stable text form of one field value — equal meaning must produce equal text. */
export function normalizeFieldValue(ref: string, value: unknown): string {
  if (value == null) return ''
  if (ref === 'System.AssignedTo') return normalizeIdentity(value)
  if (ref === 'System.Tags') {
    const list = Array.isArray(value) ? value.map((tag) => String(tag)) : String(value).split(';')
    return list
      .map((tag) => tag.trim())
      .filter(Boolean)
      .sort()
      .join('|')
      .toLowerCase()
  }
  let text: string
  if (typeof value === 'string') text = value
  else if (typeof value === 'number' || typeof value === 'boolean') text = String(value)
  else text = JSON.stringify(value) ?? ''
  if (HTML_FIELD_REFS.has(ref)) text = htmlToText(text)
  return text.trim()
}

/** FNV-1a 32-bit — enough to spot "same/different" without shipping a crypto dep. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Hash over displayed fields only; missing keys and empty values are treated the same. */
export function displayedFieldsHash(fields: Record<string, unknown>): string {
  const parts: string[] = []
  for (const ref of DISPLAYED_FIELD_REFS) {
    if (!(ref in fields)) continue
    parts.push(`${ref}=${normalizeFieldValue(ref, fields[ref])}`)
  }
  return fnv1a(parts.join('\n'))
}

/** Hash of the displayed-field projection of a polled WorkItem snapshot. */
export function workItemFingerprint(item: WorkItem): string {
  return displayedFieldsHash({
    'System.Title': item.title,
    'System.WorkItemType': item.type,
    'System.State': item.state,
    'System.BoardColumn': item.boardColumn,
    'System.AssignedTo': item.assignedToUniqueName || item.assignedTo,
    'Microsoft.VSTS.Common.Priority': item.priority,
    'Microsoft.VSTS.TCM.ReproSteps': item.reproSteps,
    'System.Description': item.description,
    'System.AreaPath': item.areaPath,
    'System.IterationPath': item.iterationPath,
    'System.Tags': item.tags,
  })
}

/**
 * Whether a realtime workitem.updated event changed a displayed field value.
 * Returns false only when deltas prove nothing visible changed; null means
 * "cannot verify" (legacy flat payload, no deltas) — the caller should notify.
 */
export function realtimeUpdateIsVisible(
  resource: unknown,
  changedFields?: string[],
): boolean | null {
  if (Array.isArray(changedFields) && changedFields.length > 0) {
    const relevant = changedFields.some((ref) => DISPLAYED_SET.has(ref))
    if (!relevant) return false
  } else if (!isRecord(resource)) {
    return null
  }
  if (!isRecord(resource)) return null

  const rawFields = isRecord(resource.fields) ? resource.fields : {}
  const deltas = new Map<string, { oldValue: unknown; newValue: unknown }>()
  for (const [ref, value] of Object.entries(rawFields)) {
    const delta = fieldDelta(value)
    if (delta) deltas.set(ref, delta)
  }
  // Legacy shape (plain values, no oldValue/newValue) — cannot verify, notify.
  if (deltas.size === 0) return null

  const revision = resource.revision
  const revisionFields =
    isRecord(revision) && isRecord(revision.fields) ? revision.fields : undefined
  const newFields: Record<string, unknown> = revisionFields ? { ...revisionFields } : {}
  const oldFields: Record<string, unknown> = { ...newFields }
  for (const [ref, delta] of deltas) {
    newFields[ref] = delta.newValue
    oldFields[ref] = delta.oldValue
  }
  return displayedFieldsHash(newFields) !== displayedFieldsHash(oldFields)
}
