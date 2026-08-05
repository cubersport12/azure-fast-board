/** Remove <img src="blob:…"> tags (temporary editor placeholders). */
export function stripBlobImages(html: string) {
  return (html || '').replace(/<img\b[^>]*\bsrc=["']blob:[^"']*["'][^>]*>/gi, '');
}

/** Unique blob: URLs from TipTap HTML, document order. */
export function extractBlobSrcs(html: string): string[] {
  const out: string[] = [];
  const re = /<img\b[^>]*\bsrc=["'](blob:[^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html || ''))) {
    if (match[1] && !out.includes(match[1])) out.push(match[1]);
  }
  return out;
}
