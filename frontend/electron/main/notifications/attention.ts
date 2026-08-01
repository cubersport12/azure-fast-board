import type { BrowserWindow, NativeImage, Tray } from 'electron'

let trayRef: Tray | null = null
let idleIcon: NativeImage | null = null
let alertIcon: NativeImage | null = null
let blinkTimer: NodeJS.Timeout | null = null
let blinkOn = false

export function bindTrayAttention(
  tray: Tray,
  icons: { idle: NativeImage; alert: NativeImage },
) {
  trayRef = tray
  idleIcon = icons.idle
  alertIcon = icons.alert
}

function startTrayBlink() {
  if (!trayRef || !idleIcon || !alertIcon) return
  if (blinkTimer) return

  blinkOn = false
  trayRef.setToolTip('Azure Fast Board — есть уведомления')
  blinkTimer = setInterval(() => {
    blinkOn = !blinkOn
    trayRef?.setImage(blinkOn ? alertIcon! : idleIcon!)
  }, 450)
  trayRef.setImage(alertIcon)
  blinkOn = true
}

function stopTrayBlink() {
  if (blinkTimer) {
    clearInterval(blinkTimer)
    blinkTimer = null
  }
  blinkOn = false
  if (trayRef && idleIcon) {
    trayRef.setImage(idleIcon)
    trayRef.setToolTip('Azure Fast Board')
  }
}

/**
 * - Hidden in tray → blink tray icon only (never show the window).
 * - Minimized / present on taskbar but unfocused → flash taskbar button.
 */
export function requestTaskbarAttention(win: BrowserWindow | null | undefined) {
  if (!win || win.isDestroyed()) return

  const focused = win.isVisible() && !win.isMinimized() && win.isFocused()
  if (focused) return

  // Свернуто в трей (окна нет на панели задач) — только мигание tray.
  if (!win.isVisible()) {
    startTrayBlink()
    return
  }

  // На панели задач (в т.ч. свёрнуто) — классическое мигание кнопки.
  win.flashFrame(true)
}

export function clearTaskbarAttention(win: BrowserWindow | null | undefined) {
  if (win && !win.isDestroyed()) {
    win.flashFrame(false)
  }
  stopTrayBlink()
}
