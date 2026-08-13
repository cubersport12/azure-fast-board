import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  cardIdFromMmTag,
  findWorkItemByTitle,
  formatRelative,
  mattermostCardUrl,
  appendMmImportFooter,
  mmCardTag,
  parseTags,
  plainTextToHtml,
  workItemColor,
} from '../../shared/utils'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    Boolean(target.closest('[data-allow-type]'))
  )
}

export {
  appendMmImportFooter,
  cardIdFromMmTag,
  findWorkItemByTitle,
  formatRelative,
  mattermostCardUrl,
  mmCardTag,
  parseTags,
  plainTextToHtml,
  workItemColor,
}
