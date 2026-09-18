import { defaultWorkItemsWiql, type AzureClient } from '../azure/client'
import {
  getCachedWorkItems,
  getMattermostCardImport,
  getMattermostCardImports,
  getSettings,
  saveMattermostCardImport,
} from '../store'
import {
  ADO_FIELD_REPRO_STEPS,
  type MattermostBoardCard,
  type MattermostCardImport,
  type MattermostImportCardsInput,
  type WorkItem,
} from '../../../shared/types'
import { cardIdFromMmTag, findWorkItemByTitle, mattermostCardUrl, appendMmImportFooter, mmCardTag } from '../../../shared/utils'
import { listMattermostBoardCards } from './client'
import { parsePriorityNumber, textToHtml } from './focalboard-map'

function isBugType(type: string) {
  return /bug/i.test(type)
}

function recoverFromTags(cardId: string, items: WorkItem[]) {
  const wanted = mmCardTag(cardId).toLowerCase()
  return items.find((item) =>
    item.tags.some((tag) => tag.trim().toLowerCase() === wanted),
  )
}

function hasOtherMmLink(item: { tags: string[] }, cardId: string) {
  return item.tags.some((tag) => {
    const linked = cardIdFromMmTag(tag)
    return Boolean(linked) && linked !== cardId
  })
}

function mappedWorkItemIds(extra: number[] = []) {
  const ids = Object.values(getMattermostCardImports())
    .map((entry) => entry?.workItemId)
    .filter((id): id is number => Number.isFinite(id))
  return new Set([...ids, ...extra])
}

function hydrateFromWorkItems(items: Array<{ id: number; tags: string[] }>) {
  for (const item of items) {
    for (const tag of item.tags) {
      const cardId = cardIdFromMmTag(tag)
      if (!cardId || getMattermostCardImport(cardId)) continue
      saveMattermostCardImport({ cardId, workItemId: item.id, boardId: '' })
    }
  }
}

export async function linkMattermostCard(
  _client: AzureClient | null,
  input: { cardId: string; workItemId: number; boardId: string },
): Promise<MattermostCardImport> {
  const cardId = input.cardId.trim()
  const boardId = input.boardId.trim()
  const workItemId = input.workItemId
  if (!cardId || !Number.isFinite(workItemId)) {
    throw new Error('Нечего связывать с TFS')
  }
  const existing = getMattermostCardImport(cardId)
  if (existing) return existing
  return saveMattermostCardImport({ cardId, workItemId, boardId })
}

async function createFromCard(
  client: AzureClient,
  card: MattermostBoardCard,
  boardId: string,
  defaults: {
    type: string
    iterationPath?: string
    assignedTo?: string
    areaPath?: string
    teamId?: string
    viewId?: string
  },
): Promise<MattermostCardImport> {
  const existing = getMattermostCardImport(card.id)
  if (existing) return existing

  const html = appendMmImportFooter(
    card.description.trim() ? textToHtml(card.description) : '',
    mattermostCardUrl(
      getSettings().notifications?.providers?.mattermost?.baseUrl || '',
      defaults.teamId?.trim() || getSettings().lastMattermostTeamId || '',
      boardId,
      defaults.viewId || '',
      card.id,
    ),
  )
  const bug = isBugType(defaults.type)
  const priority = parsePriorityNumber(card.priority)
  const tags = [...card.tags]
  const iterationPath =
    defaults.iterationPath?.trim() || getSettings().selectedIterationPath?.trim() || undefined
  const fields: Record<string, string | number | boolean | null> = {}
  if (bug && html) fields[ADO_FIELD_REPRO_STEPS] = html
  if (priority) fields['Microsoft.VSTS.Common.Priority'] = priority

  const created = await client.createWorkItem({
    type: defaults.type.trim() || 'Bug',
    title: card.title.trim() || `Mattermost ${card.id}`,
    description: !bug && html ? html : undefined,
    tags: tags.length ? tags : undefined,
    assignedTo: defaults.assignedTo?.trim() || undefined,
    areaPath: defaults.areaPath?.trim() || undefined,
    iterationPath,
    fields: Object.keys(fields).length ? fields : undefined,
  })
  return saveMattermostCardImport({
    cardId: card.id,
    workItemId: created.id,
    boardId,
  })
}

export function listMattermostImports(): MattermostCardImport[] {
  hydrateFromWorkItems(getCachedWorkItems()?.workItems ?? [])
  const raw = getMattermostCardImports()
  return Object.entries(raw)
    .filter(([, entry]) => entry?.workItemId)
    .map(([cardId, entry]) => ({
      cardId,
      workItemId: entry.workItemId,
      boardId: entry.boardId || '',
    }))
}

export async function syncMattermostImports(client: AzureClient | null) {
  if (client) {
    try {
      hydrateFromWorkItems(
        await client.listWorkItems(defaultWorkItemsWiql(getSettings().selectedIterationPath)),
      )
    } catch {
      hydrateFromWorkItems(getCachedWorkItems()?.workItems ?? [])
    }
  }
  return listMattermostImports()
}

export async function importMattermostCards(
  client: AzureClient,
  input: MattermostImportCardsInput,
): Promise<MattermostCardImport[]> {
  const boardId = input.boardId.trim()
  const type = input.type.trim() || 'Bug'
  const wanted = [...new Set(input.cardIds.map((id) => id.trim()).filter(Boolean))]
  if (!boardId) throw new Error('Выберите доску Mattermost')
  if (!wanted.length) return []

  const items = await client.listWorkItems(
    defaultWorkItemsWiql(getSettings().selectedIterationPath),
  )
  hydrateFromWorkItems(items)

  const { cards, viewId } = await listMattermostBoardCards(boardId)
  const byId = new Map(cards.map((card) => [card.id, card]))
  const results: MattermostCardImport[] = []
  const defaults = {
    type,
    iterationPath: input.iterationPath,
    assignedTo: input.assignedTo,
    areaPath: input.areaPath,
    teamId: input.teamId?.trim() || getSettings().lastMattermostTeamId || '',
    viewId: viewId || '',
  }

  for (const cardId of wanted) {
    const mapped = getMattermostCardImport(cardId)
    if (mapped) {
      results.push(mapped)
      continue
    }
    const tagged = recoverFromTags(cardId, items)
    if (tagged) {
      results.push(saveMattermostCardImport({ cardId, workItemId: tagged.id, boardId }))
      continue
    }
    const card = byId.get(cardId)
    if (!card) throw new Error(`Карточка ${cardId} не найдена на доске`)
    const taken = mappedWorkItemIds(results.map((entry) => entry.workItemId))
    const byTitle = findWorkItemByTitle(card.title, items, taken)
    if (byTitle && !hasOtherMmLink(byTitle, cardId)) {
      results.push(saveMattermostCardImport({ cardId, workItemId: byTitle.id, boardId }))
      continue
    }
    results.push(await createFromCard(client, card, boardId, defaults))
  }
  return results
}
