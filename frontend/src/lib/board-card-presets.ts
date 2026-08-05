import {
  DEFAULT_BOARD_CARD_PRESET,
  DEFAULT_BOARD_CARD_PRESET_ID,
  type BoardCardFieldId,
  type BoardCardFieldPreset,
} from '../../shared/types'

export { DEFAULT_BOARD_CARD_PRESET, DEFAULT_BOARD_CARD_PRESET_ID }

export const BOARD_CARD_FIELD_OPTIONS: Array<{ id: BoardCardFieldId; label: string }> = [
  { id: 'status', label: 'Статус' },
  { id: 'priority', label: 'Приоритет' },
  { id: 'assignee', label: 'Исполнитель' },
  { id: 'createdBy', label: 'Автор' },
  { id: 'createdDate', label: 'Дата создания' },
  { id: 'area', label: 'Место' },
  { id: 'comments', label: 'Комментарии' },
  { id: 'description', label: 'Описание' },
]

export function fieldsForPreset(
  presets: BoardCardFieldPreset[],
  activeId: string,
): Set<BoardCardFieldId> {
  const id = activeId || DEFAULT_BOARD_CARD_PRESET_ID
  const preset = presets.find((p) => p.id === id) ?? DEFAULT_BOARD_CARD_PRESET
  return new Set(preset.fields)
}

export function stripHtmlPreview(html?: string, maxLen = 120): string {
  if (!html?.trim()) return ''
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen - 1)}…`
}
