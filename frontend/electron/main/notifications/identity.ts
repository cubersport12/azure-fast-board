/** Expand Azure identity strings into comparable login/display tokens. */
export function identityTokens(value?: string | null): string[] {
  const trimmed = value?.trim()
  if (!trimmed) return []

  const tokens = new Set<string>([trimmed])

  // Common ADO forms: "ФИО <DOMAIN\\user>" / "Name <user@corp.local>"
  const angle = trimmed.match(/<([^>]+)>/)
  if (angle?.[1]?.trim()) tokens.add(angle[1].trim())

  const beforeAngle = trimmed.split('<')[0]?.trim()
  if (beforeAngle) tokens.add(beforeAngle)

  return [...tokens]
}

export function normalizeIdentity(value: string) {
  let raw = value.trim().toLowerCase()
  const angle = raw.match(/<([^>]+)>/)
  if (angle?.[1]) raw = angle[1].trim().toLowerCase()

  const afterDomain = raw.includes('\\') ? raw.slice(raw.lastIndexOf('\\') + 1) : raw
  const local = afterDomain.includes('@')
    ? afterDomain.slice(0, afterDomain.indexOf('@'))
    : afterDomain.replace(/[>]+$/g, '')
  return { raw, local }
}

export function identityMatches(a?: string | null, b?: string | null) {
  if (!a?.trim() || !b?.trim()) return false
  const left = normalizeIdentity(a)
  const right = normalizeIdentity(b)
  return left.raw === right.raw || left.local === right.local
}

export function anyIdentityMatch(left: Array<string | null | undefined>, right: Array<string | null | undefined>) {
  const a = left.flatMap((value) => identityTokens(value))
  const b = right.flatMap((value) => identityTokens(value))
  return a.some((x) => b.some((y) => identityMatches(x, y)))
}

export type NotificationIdentity = {
  uniqueName?: string
  displayName?: string
}

export type NotificationPeople = {
  assignedTo?: string
  assignedToUniqueName?: string
  createdBy?: string
  createdByUniqueName?: string
}

/**
 * Assignee or author is the current user.
 * null = not enough identity to decide (show the notification).
 */
export function isRelevantToMe(
  me: NotificationIdentity,
  people: NotificationPeople,
): boolean | null {
  const mine = [me.uniqueName, me.displayName]
  if (!mine.some((value) => value?.trim())) return null
  const assignees = [people.assignedToUniqueName, people.assignedTo]
  const authors = [people.createdByUniqueName, people.createdBy]
  if (![...assignees, ...authors].some((value) => value?.trim())) return null
  if (anyIdentityMatch(mine, assignees) || anyIdentityMatch(mine, authors)) return true
  return false
}
