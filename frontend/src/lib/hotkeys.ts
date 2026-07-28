/** Layout-independent hotkey matching via KeyboardEvent.code (physical keys). */

export function isModKey(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>) {
  return event.ctrlKey || event.metaKey
}

export function isHotkey(
  event: KeyboardEvent,
  code: string,
  options?: { mod?: boolean; shift?: boolean; alt?: boolean },
) {
  if (event.code !== code) return false
  if (Boolean(options?.mod) !== isModKey(event)) return false
  if (Boolean(options?.shift) !== event.shiftKey) return false
  if (Boolean(options?.alt) !== event.altKey) return false
  return true
}

/** Map Electron accelerator fragment (e.g. "N", "Space") to KeyboardEvent.code. */
export function acceleratorKeyToCode(key: string): string | null {
  const normalized = key.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'space') return 'Space'
  if (normalized === 'esc' || normalized === 'escape') return 'Escape'
  if (normalized === 'enter' || normalized === 'return') return 'Enter'
  if (normalized === 'tab') return 'Tab'
  if (normalized === 'up') return 'ArrowUp'
  if (normalized === 'down') return 'ArrowDown'
  if (normalized === 'left') return 'ArrowLeft'
  if (normalized === 'right') return 'ArrowRight'
  if (normalized === '/' || normalized === 'slash') return 'Slash'
  if (normalized === '?') return 'Slash'
  if (/^[a-z]$/.test(normalized)) return `Key${normalized.toUpperCase()}`
  if (/^[0-9]$/.test(normalized)) return `Digit${normalized}`
  if (normalized === 'plus' || normalized === '=') return '\u0045qual'
  if (normalized === 'minus' || normalized === '-') return 'Minus'
  return null
}

export function parseAccelerator(accelerator: string) {
  const parts = accelerator
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  if (!parts.length) return null

  const key = parts[parts.length - 1]
  const mods = parts.slice(0, -1).map((part) => part.toLowerCase())
  const code = acceleratorKeyToCode(key)
  if (!code) return null

  return {
    code,
    mod: mods.some((m) =>
      ['ctrl', 'control', 'cmd', 'command', 'commandorcontrol', 'cmdorctrl'].includes(m),
    ),
    shift: mods.includes('shift'),
    alt: mods.some((m) => m === 'alt' || m === 'option'),
  }
}

export function matchesAccelerator(event: KeyboardEvent, accelerator: string) {
  const parsed = parseAccelerator(accelerator)
  if (!parsed) return false
  return isHotkey(event, parsed.code, {
    mod: parsed.mod,
    shift: parsed.shift,
    alt: parsed.alt,
  })
}
