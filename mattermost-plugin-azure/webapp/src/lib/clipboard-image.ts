export async function fileFromClipboardEvent(event: ClipboardEvent): Promise<File | null> {
  const items = event.clipboardData?.items;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          return new File([blob], `paste-${Date.now()}.png`, {
            type: blob.type || 'image/png',
          });
        }
      }
    }
  }
  const files = event.clipboardData?.files;
  if (files) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        return file;
      }
    }
  }
  return null;
}

export function isRichTextEmpty(html: string) {
  const text = (html || '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length === 0;
}
