import { describe, expect, it } from 'vitest'
import { buildWorkItemsWiql } from '../shared/work-item-wiql'
import { defaultWorkItemsWiql } from '../electron/main/azure/client'

describe('buildWorkItemsWiql', () => {
  it('scopes default list to iteration only', () => {
    expect(defaultWorkItemsWiql('Project\\Sprint 1')).toContain(
      "[System.IterationPath] UNDER 'Project\\Sprint 1'",
    )
    expect(defaultWorkItemsWiql('')).not.toContain('IterationPath')
  })

  it('puts type, state and Me into WIQL', () => {
    const wiql = buildWorkItemsWiql({
      iterationPath: 'Proj\\Sprint 1',
      types: ['Bug', 'Task'],
      states: ['New'],
      assignees: ['Me'],
    })
    expect(wiql).toContain("[System.WorkItemType] IN ('Bug', 'Task')")
    expect(wiql).toContain("[System.State] = 'New'")
    expect(wiql).toContain('[System.AssignedTo] = @Me')
  })

  it('ORs assignee or author for notification poll', () => {
    const wiql = buildWorkItemsWiql({ meOrAuthor: true })
    expect(wiql).toContain('([System.AssignedTo] = @Me OR [System.CreatedBy] = @Me)')
  })

  it('escapes quotes in paths and names', () => {
    expect(buildWorkItemsWiql({ iterationPath: "O'Brien" })).toContain("UNDER 'O''Brien'")
    expect(buildWorkItemsWiql({ assignees: ["O'Brien"] })).toContain("[System.AssignedTo] = 'O''Brien'")
  })
})
