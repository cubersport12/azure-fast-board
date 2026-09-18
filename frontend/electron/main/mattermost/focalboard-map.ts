import type { MattermostBoardCard, MattermostBoardCardsResult, MattermostBoardInfo } from '../../../shared/types'

export type FocalboardOption = {
  id?: string
  value?: string
  color?: string
}

export type FocalboardProperty = {
  id?: string
  name?: string
  type?: string
  options?: FocalboardOption[]
}

export type FocalboardBoardJson = {
  id?: string
  title?: string
  channelId?: string
  channel_id?: string
  teamId?: string
  team_id?: string
  cardProperties?: FocalboardProperty[]
  card_properties?: FocalboardProperty[]
}

export type FocalboardBlock = {
  id?: string
  parentId?: string
  parent_id?: string
  type?: string
  title?: string
  fields?: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function str(value: unknown) {
  return String(value ?? '').trim()
}

function pickId(block: FocalboardBlock) {
  return str(block.id)
}

function pickParent(block: FocalboardBlock) {
  return str(block.parentId || block.parent_id)
}

function pickChannel(board: FocalboardBoardJson) {
  return str(board.channelId || board.channel_id) || undefined
}

function optionLabel(option: FocalboardOption) {
  return str(option.value) || str(option.id)
}

function propertiesFrom(board?: FocalboardBoardJson, blocks: FocalboardBlock[] = []) {
  const fromBoard = board?.cardProperties || board?.card_properties
  if (Array.isArray(fromBoard) && fromBoard.length) return fromBoard
  const boardBlock = blocks.find((entry) => str(entry.type) === 'board')
  const fields = asRecord(boardBlock?.fields)
  const nested = fields?.cardProperties || fields?.card_properties
  return Array.isArray(nested) ? (nested as FocalboardProperty[]) : []
}

function findProperty(
  properties: FocalboardProperty[],
  groupById: string,
  nameRe: RegExp,
  type?: string,
) {
  if (groupById) {
    const byId = properties.find((prop) => str(prop.id) === groupById)
    if (byId) return byId
  }
  const byName = properties.find((prop) => nameRe.test(str(prop.name)))
  if (byName) return byName
  if (type) return properties.find((prop) => str(prop.type) === type)
  return undefined
}
function resolveSelect(prop: FocalboardProperty | undefined, raw: unknown) {
  if (!prop) return ''
  const value = Array.isArray(raw) ? raw[0] : raw
  const id = str(value)
  if (!id) return ''
  const option = (prop.options ?? []).find((entry) => str(entry.id) === id)
  return optionLabel(option || { id, value: id })
}

function resolveMulti(prop: FocalboardProperty | undefined, raw: unknown) {
  if (!prop) return [] as string[]
  const ids = Array.isArray(raw) ? raw.map(str).filter(Boolean) : str(raw) ? [str(raw)] : []
  const options = prop.options ?? []
  return ids.map((id) => {
    const option = options.find((entry) => str(entry.id) === id)
    return optionLabel(option || { id, value: id })
  })
}

export function inferCardKind(input: { title?: string; icon?: string; typeLabel?: string }) {
  const icon = str(input.icon)
  const typeLabel = str(input.typeLabel)
  const title = str(input.title)
  const hay = `${icon} ${typeLabel} ${title}`.toLowerCase()
  if (
    icon === '!' ||
    icon.includes('❗') ||
    icon.includes('‼️') ||
    /🐛|🐞/.test(icon) ||
    /bug|баг/.test(hay)
  ) {
    return 'Bug'
  }
  if (icon.includes('⚠') || /task|таск|задач/.test(hay)) {
    return 'Task'
  }
  return 'Task'
}

function cardDescription(cardId: string, blocks: FocalboardBlock[], fields: Record<string, unknown> | null) {
  const direct = str(fields?.description)
  const texts = blocks
    .filter((block) => pickParent(block) === cardId && /^(text|h\d|quote)$/i.test(str(block.type)))
    .map((block) => str(block.title))
    .filter(Boolean)
  return [direct, ...texts].filter(Boolean).join('\n\n')
}

export function mapFocalboardBoards(
  boards: FocalboardBoardJson[],
  channelId?: string,
): MattermostBoardInfo[] {
  const wanted = str(channelId).toLowerCase()
  return boards
    .map((board) => {
      const id = str(board.id)
      if (!id) return null
      const channel = pickChannel(board)
      if (wanted && channel?.toLowerCase() !== wanted) return null
      const info: MattermostBoardInfo = {
        id,
        title: str(board.title) || id,
      }
      if (channel) info.channelId = channel
      return info
    })
    .filter((entry): entry is MattermostBoardInfo => Boolean(entry))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
}

export function mapFocalboardCards(
  blocks: FocalboardBlock[],
  board?: FocalboardBoardJson,
): MattermostBoardCardsResult {
  const properties = propertiesFrom(board, blocks)
  const views = blocks.filter((block) => str(block.type) === 'view')
  const groupByIdOf = (view: FocalboardBlock) =>
    str(asRecord(view.fields)?.groupById || asRecord(view.fields)?.group_by_id)
  const viewTypeOf = (view: FocalboardBlock) =>
    str(asRecord(view.fields)?.type || asRecord(view.fields)?.viewType).toLowerCase()

  // Группа канбан-вида — это колонки доски (статус карточки). Берём именно
  // board-вид: первый попавшийся view может быть сгруппирован по приоритету.
  const boardViews = views.filter((view) => viewTypeOf(view) === 'board')
  const groupedView =
    boardViews.find((view) => groupByIdOf(view)) || boardViews[0] || views.find((view) => groupByIdOf(view))
  const groupById = groupedView ? groupByIdOf(groupedView) : ''
  const viewId = str(groupedView?.id)

  const statusProp = findProperty(properties, groupById, /status|статус|состоян/i, 'select')
  // Если группировка указывает на приоритет, а свойство статуса есть по имени —
  // статусом считается именованное свойство, а не группа приоритетов.
  const statusByName = properties.find((prop) => /status|статус|состоян/i.test(str(prop.name)))
  const resolvedStatus =
    statusByName && /priority|приоритет/i.test(str(statusProp?.name))
      ? statusByName
      : statusProp || statusByName
  const priorityProp = findProperty(properties, '', /priority|приоритет/i, undefined)
  const typeProp = findProperty(properties, '', /^(type|тип)$/i, undefined)
  const tagsProp =
    findProperty(properties, '', /tag|label|метк|свойств/i, 'multiSelect') ||
    properties.find((prop) => str(prop.type) === 'multiSelect')

  const cards = blocks
    .filter((block) => str(block.type) === 'card')
    .map((block) => {
      const id = pickId(block)
      const fields = asRecord(block.fields)
      const rawProps = asRecord(fields?.properties) || {}
      const statusKey = str(resolvedStatus?.id)
      const priorityKey = str(priorityProp?.id)
      const typeKey = str(typeProp?.id)
      const tagsKey = str(tagsProp?.id)
      const title = str(block.title) || id
      const typeLabel = resolveSelect(typeProp, rawProps[typeKey])
      const icon = str(fields?.icon)
      return {
        id,
        title,
        description: cardDescription(id, blocks, fields),
        status: resolveSelect(resolvedStatus, rawProps[statusKey]),
        priority: resolveSelect(priorityProp, rawProps[priorityKey]),
        tags: resolveMulti(tagsProp, rawProps[tagsKey]),
        kind: inferCardKind({ title, icon, typeLabel }),
      } satisfies MattermostBoardCard
    })
    .filter((card) => Boolean(card.id))

  const unique = (values: string[]) =>
    [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'ru'),
    )

  return {
    cards,
    statuses: unique([
      ...(resolvedStatus?.options ?? []).map(optionLabel),
      ...cards.map((card) => card.status),
    ]),
    priorities: unique([
      ...(priorityProp?.options ?? []).map(optionLabel),
      ...cards.map((card) => card.priority),
    ]),
    tags: unique([
      ...(tagsProp?.options ?? []).map(optionLabel),
      ...cards.flatMap((card) => card.tags),
    ]),
    viewId: viewId || undefined,
  }
}

export function parsePriorityNumber(raw: string) {
  const match = raw.trim().match(/(\d)/)
  if (!match) return undefined
  const value = Number(match[1])
  return value >= 1 && value <= 4 ? value : undefined
}

export { cardIdFromMmTag, mmCardTag, plainTextToHtml as textToHtml } from '../../../shared/utils'
