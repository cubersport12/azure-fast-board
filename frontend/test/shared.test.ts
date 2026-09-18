import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from '../shared/ipc'
import { DEFAULT_SETTINGS } from '../shared/types'
import {
  boardColumnsFromStates,
  columnStateFallback,
  resolveBoardColumnName,
} from '../shared/board-columns'
import {
  findWorkItemByTitle,
  mmCardTag,
  cardIdFromMmTag,
  mattermostCardUrl,
  appendMmImportFooter,
  normalizeAreaFieldPath,
  normalizeIterationFieldPath,
  normalizeWorkItemTitle,
  plainTextToHtml,
  formatAppVersionLabel,
  isRemoteVersionNewer,
  parseAppVersion,
  parseGithubReleaseTag,
} from '../shared/utils'

describe('shared contracts', () => {
  it('exposes required ipc channels', () => {
    expect(IPC_CHANNELS.workItemsCreate).toBe('workItems:create')
    expect(IPC_CHANNELS.mattermostListBoards).toBe('mattermost:listBoards')
    expect(IPC_CHANNELS.eventShowQuickCreate).toBe('event:showQuickCreate')
    expect(IPC_CHANNELS.iterationPaths).toBe('meta:iterationPaths')
    expect(IPC_CHANNELS.mattermostLinkCard).toBe('mattermost:linkCard')
    expect(IPC_CHANNELS.appCheckUpdate).toBe('app:checkUpdate')
  })

  it('maps Bug and Task states onto the same board columns', () => {
    const columns = boardColumnsFromStates(['New', 'InProgress', 'Commited', 'Done', 'Removed'])
    expect(columns.map((column) => column.name)).toEqual([
      'New',
      'InProgress',
      'Commited',
      'Done',
      'Removed',
    ])
    expect(resolveBoardColumnName('In Progress', ['InProgress'])).toBe('InProgress')
    expect(resolveBoardColumnName('Committed', ['Commited'])).toBe('Commited')
    expect(resolveBoardColumnName('To Do')).toBe('New')
    expect(columnStateFallback('In Progress')).toBe('InProgress')
    expect(columnStateFallback('Committed')).toBe('Commited')
  })

  it('compares GitHub release tags against the local build', () => {
    expect(formatAppVersionLabel('0.1.0', '15')).toBe('0.1.0-build.15')
    expect(formatAppVersionLabel('0.1.0-build.15', '99')).toBe('0.1.0-build.15')
    expect(parseAppVersion('v0.1.0-build.15')).toEqual({
      major: 0,
      minor: 1,
      patch: 0,
      build: 15,
    })
    expect(isRemoteVersionNewer('0.1.0', 'v0.1.0-build.15')).toBe(true)
    expect(isRemoteVersionNewer('0.1.0-build.15', 'v0.1.0-build.15')).toBe(false)
    expect(isRemoteVersionNewer('0.1.0-build.16', 'v0.1.0-build.15')).toBe(false)
    expect(isRemoteVersionNewer('0.1.0-build.14', 'v0.1.0-build.15')).toBe(true)
    expect(
      parseGithubReleaseTag(
        'https://github.com/cubersport12/azure-fast-board/releases/tag/v0.1.0-build.15',
      ),
    ).toBe('v0.1.0-build.15')
  })

  it('has speed-first defaults', () => {
    expect(DEFAULT_SETTINGS.launchMinimized).toBe(true)
    expect(DEFAULT_SETTINGS.hideToTrayOnClose).toBe(true)
    expect(DEFAULT_SETTINGS.globalHotkey).toContain('Shift+Space')
    expect(DEFAULT_SETTINGS.subscribedIterations).toEqual([])
    expect(DEFAULT_SETTINGS.selectedIterationPath).toBe('')
    expect(DEFAULT_SETTINGS.lastAssignee).toBe('')
    expect(DEFAULT_SETTINGS.lastMattermostImportType).toBe('Bug')
    expect(DEFAULT_SETTINGS.filters).toEqual({
      types: [],
      states: [],
      assignees: [],
      creators: [],
      tags: [],
    })
    expect(DEFAULT_SETTINGS.filterPresets).toEqual([])
    expect(DEFAULT_SETTINGS.selectFavorites).toEqual({})
    expect(DEFAULT_SETTINGS.notifications.enabled).toBe(true)
    expect(DEFAULT_SETTINGS.notifications.apiUrl).toBe('http://172.22.91.47:8787')
    expect(DEFAULT_SETTINGS.notifications.providers.app.flashTaskbar).toBe(true)
    expect(IPC_CHANNELS.serviceHooksList).toBe('serviceHooks:list')
    expect(IPC_CHANNELS.eventNotification).toBe('event:notification')
  })

  it('strips structural Iteration node from field paths', () => {
    expect(normalizeIterationFieldPath('\\Proj\\Iteration\\Sprint 1', 'Proj')).toBe(
      'Proj\\Sprint 1',
    )
    expect(normalizeIterationFieldPath('Proj\\Iteration\\Rel\\S1', 'Proj')).toBe('Proj\\Rel\\S1')
    expect(normalizeIterationFieldPath('Proj\\Sprint 1', 'Proj')).toBe('Proj\\Sprint 1')
  })

  it('strips structural Area node from field paths', () => {
    expect(normalizeAreaFieldPath('\\Proj\\Area\\Team A', 'Proj')).toBe('Proj\\Team A')
    expect(normalizeAreaFieldPath('Proj\\Area', 'Proj')).toBe('Proj')
    expect(normalizeAreaFieldPath('Proj\\Team A', 'Proj')).toBe('Proj\\Team A')
  })

  it('matches TFS work items by card title', () => {
    expect(normalizeWorkItemTitle('  Баг   градиента ')).toBe('баг градиента')
    expect(plainTextToHtml('a <b>\n')).toBe('a &lt;b&gt;<br/>')
    expect(mmCardTag('abc')).toBe('mm:abc')
    expect(cardIdFromMmTag('mm:abc')).toBe('abc')
    expect(
      mattermostCardUrl('https://mm.example.com/', 'team1', 'board1', 'view1', 'card1'),
    ).toBe('https://mm.example.com/boards/team/team1/board1/view1/card1')
    expect(
      mattermostCardUrl('https://mm.example.com', 'team1', 'board1', '', 'card1'),
    ).toBe('https://mm.example.com/boards/team/team1/board1?cardId=card1')
    expect(mattermostCardUrl('https://mm.example.com', '', 'board1', 'view1', 'card1')).toBe(
      'https://mm.example.com/boards/board1?cardId=card1',
    )
    expect(
      appendMmImportFooter('Шаги', 'https://mm.example.com/boards/b?cardId=c'),
    ).toContain('Карточка создана из Mattermost Boards')
    expect(appendMmImportFooter('Шаги', 'https://mm.example.com/boards/b?cardId=c')).toContain(
      'href="https://mm.example.com/boards/b?cardId=c"',
    )
    const items = [
      { id: 1, title: 'Баг градиента' },
      { id: 2, title: 'Другое' },
    ]
    expect(findWorkItemByTitle('баг градиента', items)?.id).toBe(1)
    expect(findWorkItemByTitle('Баг градиента', items, new Set([1]))).toBeUndefined()
    expect(findWorkItemByTitle('нет такого', items)).toBeUndefined()
  })
})
