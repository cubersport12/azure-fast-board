/** Shared Bug/Task board columns after process alignment. */
const BOARD_COLUMN_SLOTS: Array<{ id: string; label: string; aliases: string[] }> = [
  { id: 'new', label: 'New', aliases: ['new', 'todo', 'approved'] },
  { id: 'inprogress', label: 'InProgress', aliases: ['inprogress', 'active'] },
  { id: 'committed', label: 'Commited', aliases: ['commited', 'committed'] },
  { id: 'done', label: 'Done', aliases: ['done', 'closed', 'resolved', 'completed'] },
  { id: 'removed', label: 'Removed', aliases: ['removed'] },
]

export function normalizeStateKey(name: string) {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function slotForState(name: string) {
  const key = normalizeStateKey(name)
  if (!key) return undefined
  return BOARD_COLUMN_SLOTS.find((slot) => slot.aliases.includes(key))
}

/** Map any WIT/board name onto the shared column label (prefer live TFS state names). */
export function resolveBoardColumnName(name: string, knownStates: string[] = []) {
  const slot = slotForState(name)
  if (!slot) return name.trim() || 'New'
  const fromTypes = knownStates.find((state) => slotForState(state)?.id === slot.id)
  return fromTypes || slot.label
}

export function boardColumnsFromStates(knownStates: string[] = []) {
  return BOARD_COLUMN_SLOTS.map((slot, order) => ({
    id: slot.id,
    name: knownStates.find((state) => slotForState(state)?.id === slot.id) || slot.label,
    order,
  }))
}

export function columnStateFallback(column: string) {
  return slotForState(column)?.label || 'New'
}

/** Known states whose resolved board column is one of the selected column names. */
export function statesForColumns(selected: string[], knownStates: string[] = []) {
  if (!selected.length) return []
  const selectedKey = new Set(selected.map(normalizeStateKey))
  return knownStates.filter((state) =>
    selectedKey.has(normalizeStateKey(resolveBoardColumnName(state, knownStates))),
  )
}
