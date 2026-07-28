import { describe, expect, it } from 'vitest'
import { decodeHtmlEntities, htmlToPlainText } from '../src/lib/html-text'

describe('decodeHtmlEntities', () => {
  it('decodes common entities and numeric codes', () => {
    expect(decodeHtmlEntities('&quot;Собрано&quot;')).toBe('"Собрано"')
    expect(decodeHtmlEntities('цвет:&nbsp;#134394')).toBe('цвет:\u00A0#134394')
    expect(decodeHtmlEntities('A &amp; B')).toBe('A & B')
    expect(decodeHtmlEntities('&#39;x&#39;')).toBe("'x'")
  })

  it('decodes double-encoded entities', () => {
    expect(decodeHtmlEntities('&amp;quot;Собрано&amp;quot;')).toBe('"Собрано"')
  })
})

describe('htmlToPlainText', () => {
  it('strips tags and decodes entities', () => {
    expect(
      htmlToPlainText(
        '<p>Заменить цвет в плитке &quot;Собрано&quot; на цвет:&nbsp; #134394</p>',
      ),
    ).toBe('Заменить цвет в плитке "Собрано" на цвет:  #134394')
  })
})
