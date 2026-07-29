import { describe, expect, it } from 'vitest'
import {
  decodeHtmlEntities,
  htmlToPlainText,
  mediaUrlsMatch,
  removeImageFromDescription,
} from '../src/lib/html-text'

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

describe('removeImageFromDescription', () => {
  const guid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const url = `https://tfs.local/DefaultCollection/_apis/wit/attachments/${guid}`

  it('removes matching img and wrapping paragraph', () => {
    const html = `<div>text</div><p><img src="${url}" alt="shot" /></p><p>more</p>`
    expect(removeImageFromDescription(html, url)).toBe('<div>text</div><p>more</p>')
  })

  it('matches by attachment guid', () => {
    const html = `<img src="${url}?fileName=a.png" />`
    expect(removeImageFromDescription(html, guid)).toBe('')
  })
})

describe('mediaUrlsMatch', () => {
  it('matches same attachment guid across urls', () => {
    const guid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    expect(
      mediaUrlsMatch(
        `https://a/_apis/wit/attachments/${guid}`,
        `https://b/_apis/wit/attachments/${guid}?fileName=x.png`,
      ),
    ).toBe(true)
  })
})
