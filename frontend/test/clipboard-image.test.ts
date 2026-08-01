import { describe, expect, it } from 'vitest'
import { renderCommentHtml } from '../src/lib/clipboard-image'
import { isRichTextEmpty } from '../src/components/rich-text-editor'

describe('renderCommentHtml', () => {
  it('keeps HTML comments as HTML', () => {
    const html = '<div>Текст</div><p><img src="https://tfs/_apis/wit/attachments/abc" /></p>'
    expect(renderCommentHtml(html)).toBe(html)
  })

  it('renders legacy plain text with markdown images', () => {
    const out = renderCommentHtml('Hello\n\n![shot](https://example.com/a.png)')
    expect(out).toContain('Hello')
    expect(out).toContain('<br />')
    expect(out).toContain('<img src="https://example.com/a.png"')
    expect(out).not.toContain('![shot]')
  })
})

describe('isRichTextEmpty', () => {
  it('detects empty tip tap shells', () => {
    expect(isRichTextEmpty('')).toBe(true)
    expect(isRichTextEmpty('<p></p>')).toBe(true)
    expect(isRichTextEmpty('<p><br></p>')).toBe(true)
    expect(isRichTextEmpty('<p>hi</p>')).toBe(false)
    expect(isRichTextEmpty('<p><img src="x"></p>')).toBe(false)
  })
})
