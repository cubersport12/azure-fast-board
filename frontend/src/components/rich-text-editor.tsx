import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  ImageIcon,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Underline as UnderlineIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { extractHtmlImageSrcs, isRemoteMediaUrl } from '@/lib/authenticated-media'
import { extractImageFromClipboardEvent, fileToAttachment } from '@/lib/clipboard-image'
import { debugLog } from '@/lib/debug-log'
import { normalizeAdoHtmlForEditor } from '@/lib/normalize-ado-html'
import { getAzureApi } from '@/lib/azure-api'
import type { AttachmentUpload } from '../../shared/types'
import { cn } from '@/lib/utils'

function ToolbarButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800',
        active && 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
      )}
    >
      {children}
    </button>
  )
}

/** Fetch ADO images via NTLM and rewrite src to short blob: URLs TipTap can show. */
async function materializeImagesToBlobs(html: string): Promise<{
  html: string
  blobToOriginal: Map<string, string>
  blobUrls: string[]
}> {
  const blobToOriginal = new Map<string, string>()
  const blobUrls: string[] = []
  const api = getAzureApi()
  if (!api?.fetchMedia) return { html, blobToOriginal, blobUrls }

  let next = html
  for (const url of extractHtmlImageSrcs(html).filter(isRemoteMediaUrl)) {
    try {
      const media = await api.fetchMedia(url)
      const binary = Uint8Array.from(atob(media.dataBase64), (c) => c.charCodeAt(0))
      const blob = new Blob([binary], { type: media.mimeType || 'image/png' })
      const blobUrl = URL.createObjectURL(blob)
      blobUrls.push(blobUrl)
      blobToOriginal.set(blobUrl, url)
      next = next.split(url).join(blobUrl)
      const encoded = url.replace(/&/g, '&amp;')
      if (encoded !== url) next = next.split(encoded).join(blobUrl)
    } catch (error) {
      debugLog('[editor] blob materialize failed', { url, error: String(error) })
    }
  }
  return { html: next, blobToOriginal, blobUrls }
}

function restoreOriginalSrcs(html: string, blobToOriginal: Map<string, string>) {
  let next = html
  for (const [blobUrl, original] of blobToOriginal) {
    next = next.split(blobUrl).join(original)
  }
  // Also restore any leftover data: URLs if present.
  return next
}

export interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  onUploadImage: (file: AttachmentUpload) => Promise<string>
  placeholder?: string
  editable?: boolean
  minHeight?: number
  className?: string
  'data-composer'?: string
}

export function RichTextEditor({
  value,
  onChange,
  onUploadImage,
  placeholder = 'Введите текст…',
  editable = true,
  minHeight = 120,
  className,
  'data-composer': dataComposer = 'editor',
}: RichTextEditorProps) {
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const syncingFromProps = useRef(false)
  const lastEmitted = useRef('')
  const hydratedKey = useRef<string | null>(null)
  const loadGen = useRef(0)
  const blobToOriginalRef = useRef(new Map<string, string>())
  const blobUrlsRef = useRef<string[]>([])
  const uploadRef = useRef(onUploadImage)
  const editorRef = useRef<ReturnType<typeof useEditor>>(null)
  const onChangeRef = useRef(onChange)
  /** Last non-empty value from props — survives empty parent pulses before/after mount. */
  const lastGoodValueRef = useRef('')
  const valueRef = useRef(value)
  valueRef.current = value
  if (htmlPlainText(value) || /<img\b/i.test(value || '')) {
    lastGoodValueRef.current = value
  }
  uploadRef.current = onUploadImage
  onChangeRef.current = onChange

  const log = (message: string, data?: unknown) => {
    debugLog(`[editor:${dataComposer}] ${message}`, data)
  }

  const emitHtml = (editorHtml: string) => {
    const restored = restoreOriginalSrcs(editorHtml, blobToOriginalRef.current)
    if (restored === lastEmitted.current) return
    // Ignore image-hydration pulses that strip body text (parent may echo them back).
    if (
      dataComposer === 'body' &&
      htmlPlainText(lastEmitted.current) &&
      htmlPlainText(restored).length < htmlPlainText(lastEmitted.current).length
    ) {
      log('ignore emit that drops text', {
        prev: htmlPlainText(lastEmitted.current),
        next: htmlPlainText(restored),
      })
      return
    }
    lastEmitted.current = restored
    onChangeRef.current(restored)
  }

  const editor = useEditor({
    editable,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      // Inline images — matches Azure DevOps (text + screenshot in one line).
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: cn(
          'tiptap max-w-none px-3 py-2 text-sm text-slate-800 outline-none dark:text-slate-100',
          '[&_img]:mx-1 [&_img]:inline [&_img]:max-h-80 [&_img]:max-w-full [&_img]:align-middle [&_img]:rounded-lg [&_img]:border',
          '[&_p]:my-1 [&_strong]:font-bold [&_b]:font-bold',
        ),
        style: `min-height:${minHeight}px`,
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items
        let hasImage = false
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              hasImage = true
              break
            }
          }
        }
        if (!hasImage) return false

        event.preventDefault()
        void (async () => {
          const image = await extractImageFromClipboardEvent(event as ClipboardEvent)
          const current = editorRef.current
          if (!image || !current) return
          setUploading(true)
          try {
            const adoUrl = await uploadRef.current(image)
            const api = getAzureApi()
            let displaySrc = adoUrl
            if (api?.fetchMedia) {
              const media = await api.fetchMedia(adoUrl)
              const binary = Uint8Array.from(atob(media.dataBase64), (c) => c.charCodeAt(0))
              const blob = new Blob([binary], { type: media.mimeType || 'image/png' })
              displaySrc = URL.createObjectURL(blob)
              blobUrlsRef.current.push(displaySrc)
              blobToOriginalRef.current.set(displaySrc, adoUrl)
            }
            current.chain().focus().setImage({ src: displaySrc, alt: image.fileName }).run()
          } finally {
            setUploading(false)
          }
        })()
        return true
      },
    },
    onUpdate: ({ editor: current }) => {
      if (syncingFromProps.current) return
      emitHtml(current.getHTML())
    },
  })

  editorRef.current = editor

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable)
  }, [editor, editable])

  // Revoke blobs on unmount.
  useEffect(() => {
    return () => {
      for (const url of blobUrlsRef.current) URL.revokeObjectURL(url)
      blobUrlsRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!editor) {
      log('wait editor', { valueChars: (valueRef.current || '').length })
      return
    }

    // Body only: prefer last good props over empty pulses while parent re-seeds.
    const incoming = valueRef.current || ''
    const incomingText = htmlPlainText(incoming)
    const incomingHasImg = /<img\b/i.test(incoming)
    const source =
      dataComposer === 'body' &&
      !incomingText &&
      !incomingHasImg &&
      lastGoodValueRef.current
        ? lastGoodValueRef.current
        : incoming
    const sourceText = htmlPlainText(source)
    const sourceHasImg = /<img\b/i.test(source)
    const editorText = htmlPlainText(editor.getHTML())

    // Parent echoed our onChange — do not setContent (was causing jump on every key).
    if (source === lastEmitted.current) {
      return
    }

    // Never wipe a hydrated / non-empty editor with an empty value.
    if (!sourceText && !sourceHasImg) {
      if (hydratedKey.current !== null || editorText || htmlPlainText(lastEmitted.current)) {
        log('skip empty value — keep editor', { editorText })
        return
      }
      return
    }

    // After first hydrate, ignore ordinary typing from parent.
    // Re-hydrate only when remote image URLs change from outside (not local paste).
    const remoteUrls = extractHtmlImageSrcs(source).filter(isRemoteMediaUrl)
    const remoteKey = remoteUrls.slice().sort().join('|')
    if (hydratedKey.current !== null) {
      if (remoteKey === hydratedKey.current) {
        lastEmitted.current = source
        return
      }
      // Paste/upload already inserted blob previews — don't setContent again.
      const knownRemotes = new Set(blobToOriginalRef.current.values())
      if (remoteUrls.length > 0 && remoteUrls.every((url) => knownRemotes.has(url))) {
        hydratedKey.current = remoteKey
        lastEmitted.current = source
        return
      }
      const prevText = htmlPlainText(lastEmitted.current) || editorText
      if (prevText && sourceText.length < prevText.length) {
        log('skip value that drops text', { sourceText, prevText })
        return
      }
    }

    const gen = ++loadGen.current
    const run = async () => {
      const normalized = normalizeAdoHtmlForEditor(source)
      const imageSrcs = extractHtmlImageSrcs(normalized)
      log('hydrate start', {
        sourceText,
        images: imageSrcs.length,
        normalized: normalized.slice(0, 280),
      })

      const textOnlyHtml = stripImagesKeepMarks(normalized)
      syncingFromProps.current = true
      editor.commands.setContent(textOnlyHtml || '<p></p>', { emitUpdate: false })
      lastEmitted.current = source
      // '' is valid (text-only); null means "not hydrated yet".
      hydratedKey.current = remoteKey
      log('styled text-first', {
        text: htmlPlainText(editor.getHTML()),
        html: editor.getHTML().slice(0, 200),
      })

      if (imageSrcs.length === 0) {
        lastEmitted.current = restoreOriginalSrcs(editor.getHTML(), blobToOriginalRef.current)
        syncingFromProps.current = false
        return
      }

      setLoading(true)
      try {
        const { html, blobToOriginal, blobUrls } = await materializeImagesToBlobs(normalized)
        if (gen !== loadGen.current) {
          for (const url of blobUrls) URL.revokeObjectURL(url)
          return
        }
        for (const url of blobUrlsRef.current) URL.revokeObjectURL(url)
        blobUrlsRef.current = blobUrls
        blobToOriginalRef.current = blobToOriginal

        editor.commands.setContent(html || textOnlyHtml || '<p></p>', { emitUpdate: false })
        let rendered = editor.getHTML()

        if (sourceText && !htmlPlainText(rendered)) {
          log('TipTap dropped text — retry styled fallback')
          editor.commands.setContent(textOnlyHtml || `<p>${escapeHtml(sourceText)}</p>`, {
            emitUpdate: false,
          })
          for (const blobUrl of blobToOriginal.keys()) {
            editor.commands.insertContent({
              type: 'image',
              attrs: { src: blobUrl, alt: 'image' },
            })
          }
          rendered = editor.getHTML()
        }

        log('final applied', {
          text: htmlPlainText(rendered),
          html: rendered.replace(/blob:[^"']+/g, 'blob:…'),
        })

        lastEmitted.current = restoreOriginalSrcs(rendered, blobToOriginal)
        hydratedKey.current = remoteKey
      } finally {
        if (gen === loadGen.current) {
          setLoading(false)
          syncingFromProps.current = false
        }
      }
    }

    void run()
  }, [editor, value, dataComposer])

  const insertUploadedImage = async (file: AttachmentUpload) => {
    if (!editor) return
    setUploading(true)
    try {
      const adoUrl = await onUploadImage(file)
      const api = getAzureApi()
      let displaySrc = adoUrl
      if (api?.fetchMedia) {
        const media = await api.fetchMedia(adoUrl)
        const binary = Uint8Array.from(atob(media.dataBase64), (c) => c.charCodeAt(0))
        const blob = new Blob([binary], { type: media.mimeType || 'image/png' })
        displaySrc = URL.createObjectURL(blob)
        blobUrlsRef.current.push(displaySrc)
        blobToOriginalRef.current.set(displaySrc, adoUrl)
      }
      editor.chain().focus().setImage({ src: displaySrc, alt: file.fileName }).run()
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950',
        className,
      )}
      data-composer={dataComposer}
    >
      {loading && (
        <div className="border-b border-slate-100 px-3 py-1 text-[11px] text-slate-400 dark:border-slate-800">
          Загрузка изображений…
        </div>
      )}
      <EditorContent editor={editor} />
      <div className="flex flex-wrap items-center gap-0.5 border-t border-slate-100 px-1.5 py-1 dark:border-slate-800">
        <ToolbarButton
          title="Жирный"
          active={editor?.isActive('bold')}
          disabled={!editable || !editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Курсив"
          active={editor?.isActive('italic')}
          disabled={!editable || !editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Подчёркнутый"
          active={editor?.isActive('underline')}
          disabled={!editable || !editor}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Маркированный список"
          active={editor?.isActive('bulletList')}
          disabled={!editable || !editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Нумерованный список"
          active={editor?.isActive('orderedList')}
          disabled={!editable || !editor}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Вставить изображение"
          disabled={!editable || uploading || !editor}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5" />
          )}
        </ToolbarButton>
        <span className="ml-auto px-2 text-[11px] text-slate-400">
          {uploading ? 'Загрузка…' : 'Ctrl+V — скриншот'}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            void fileToAttachment(file).then((attachment) => insertUploadedImage(attachment))
          }}
        />
      </div>
    </div>
  )
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Remove <img> but keep marks/structure so bold text shows while media loads. */
function stripImagesKeepMarks(html: string) {
  return html
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<p>\s*<\/p>/gi, '')
    .trim()
}

/** Visible text only (tags/entities stripped). */
export function htmlPlainText(html: string) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when HTML has no meaningful text/images. */
export function isRichTextEmpty(html: string) {
  if (!html?.trim()) return true
  if (/<img\b/i.test(html)) return false
  return !htmlPlainText(html)
}
