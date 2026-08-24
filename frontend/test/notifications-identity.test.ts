import { describe, expect, it } from 'vitest'
import {
  anyIdentityMatch,
  identityMatches,
  identityTokens,
  isRelevantToMe,
} from '../electron/main/notifications/identity'

describe('notification identity matching', () => {
  it('parses ADO display form Name <DOMAIN\\user>', () => {
    expect(identityTokens('Иванов Алексей Александрович <ZAV\\ivanovaa>')).toEqual(
      expect.arrayContaining([
        'Иванов Алексей Александрович <ZAV\\ivanovaa>',
        'ZAV\\ivanovaa',
        'Иванов Алексей Александрович',
      ]),
    )
  })

  it('matches DOMAIN\\user against Name <DOMAIN\\user>', () => {
    expect(
      identityMatches('ZAV\\ivanovaa', 'Иванов Алексей Александрович <ZAV\\ivanovaa>'),
    ).toBe(true)
    expect(
      anyIdentityMatch(
        ['ZAV\\ivanovaa'],
        ['Иванов Алексей Александрович <ZAV\\ivanovaa>', undefined],
      ),
    ).toBe(true)
  })

  it('does not match different accounts', () => {
    expect(
      anyIdentityMatch(['ZAV\\ivanovaa'], ['Артеменко Юрий <ZAV\\artimenko>']),
    ).toBe(false)
  })

  it('treats assignee or author as relevant', () => {
    const me = { uniqueName: 'ZAV\\ivanovaa', displayName: 'Иванов' }
    expect(
      isRelevantToMe(me, { assignedToUniqueName: 'ZAV\\ivanovaa', createdByUniqueName: 'other' }),
    ).toBe(true)
    expect(
      isRelevantToMe(me, { assignedToUniqueName: 'other', createdByUniqueName: 'ZAV\\ivanovaa' }),
    ).toBe(true)
    expect(
      isRelevantToMe(me, { assignedToUniqueName: 'other', createdByUniqueName: 'other' }),
    ).toBe(false)
    expect(isRelevantToMe(me, {})).toBeNull()
  })
})
