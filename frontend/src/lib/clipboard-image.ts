import type { AttachmentUpload } from '../../shared/types'
import { getAzureApi } from '@/lib/azure-api'

export interface PendingImage extends AttachmentUpload {
  id: string
  previewUrl: string
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export async function fileToAttachment(file: File, fileName?: string): Promise<AttachmentUpload> {
  const buffer = await file.arrayBuffer()
  return {
    fileName: fileName || file.name || `paste-${Date.now()}.png`,
    mimeType: file.type || 'image/png',
    dataBase64: bytesToBase64(new Uint8Array(buffer)),
  }
}

export async function extractImageFromClipboardEvent(
  event: ClipboardEvent,
): Promise<AttachmentUpload | null> {
  const items = event.clipboardData?.items
  if (items) {
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile()
        if (!blob) continue
        return fileToAttachment(blob, `paste-${Date.now()}.png`)
      }
    }
  }

  const files = event.clipboardData?.files
  if (files) {
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        return fileToAttachment(file)
      }
    }
  }

  return getAzureApi()?.readClipboardImage() ?? null
}

export function toPendingImage(file: AttachmentUpload): PendingImage {
  return {
    ...file,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    previewUrl: `data:${file.mimeType};base64,${file.dataBase64}`,
  }
}

export function attachmentMarkdown(url: string, fileName: string) {
  return `![${fileName}](${url})`
}

/** Render comment body: native HTML from ADO / TipTap, or legacy plain+markdown images. */
export function renderCommentHtml(text: string) {
  const raw = text ?? ''
  if (!raw.trim()) return ''

  // Rich HTML from Azure web UI or our TipTap editor.
  if (/<[a-z][\s\S]*>/i.test(raw)) {
    return raw
  }

  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const withImages = escaped.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, alt: string, url: string) => {
      const safeUrl = url.startsWith('http') || url.startsWith('data:') ? url : ''
      if (!safeUrl) return _match
      return `<img src="${safeUrl}" alt="${alt}" class="mt-2 max-h-64 rounded-lg border border-slate-200" />`
    },
  )

  return withImages.replace(/\n/g, '<br />')
}
