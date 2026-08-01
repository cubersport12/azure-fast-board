import { describe, expect, it } from 'vitest'
import { normalizeAdoHtmlForEditor } from '../src/lib/normalize-ado-html'

describe('normalizeAdoHtmlForEditor', () => {
  it('keeps text+image inline in one paragraph (ADO style)', () => {
    const input =
      '<div>Тут описание<br><img src="https://tfs/_apis/wit/attachments/abc" alt="shot"></div>'
    const out = normalizeAdoHtmlForEditor(input)
    expect(out).toMatch(/Тут описание/)
    expect(out).toMatch(/<img[^>]+src="https:\/\/tfs\/_apis\/wit\/attachments\/abc"/i)
    // Image stays in the same paragraph as the text (inline).
    expect(out).toMatch(/<p>[\s\S]*Тут описание[\s\S]*<img[\s\S]*<\/p>/i)
  })

  it('keeps image inline next to text inside a paragraph', () => {
    const input = '<p>Шаг 1<img src="https://example.com/a.png"></p>'
    const out = normalizeAdoHtmlForEditor(input)
    expect(out).toContain('Шаг 1')
    expect(out).toMatch(/<img[^>]+src="https:\/\/example.com\/a.png"/i)
    expect(out).toMatch(/<p>[\s\S]*Шаг 1[\s\S]*<img[\s\S]*<\/p>/i)
  })

  it('handles empty input', () => {
    expect(normalizeAdoHtmlForEditor('')).toBe('')
    expect(normalizeAdoHtmlForEditor('   ')).toBe('')
  })

  it('preserves bold and hoists img out of strong (real ADO ReproSteps)', () => {
    const input =
      '<p><strong>Шаги воспроизведения&nbsp;<img src="https://opo-tfs.zav.mir/DefaultCollection/x/_apis/wit/attachments/abc?fileName=image.png" alt="Изображение"></strong> </p>'
    const out = normalizeAdoHtmlForEditor(input)
    expect(out).toMatch(/Шаги воспроизведения/)
    expect(out).toMatch(/<strong>[\s\S]*Шаги воспроизведения[\s\S]*<\/strong>/i)
    expect(out).toMatch(/attachments\/abc/)
    // Image must not stay inside <strong>, but stays in the same <p>.
    expect(out).not.toMatch(/<strong>[^<]*<img/i)
    expect(out).toMatch(/<p>[\s\S]*<strong>[\s\S]*<\/strong>[\s\S]*<img[\s\S]*<\/p>/i)
  })
})
