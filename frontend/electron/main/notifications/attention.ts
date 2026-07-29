import type { BrowserWindow } from 'electron'

/**
 * Classic Windows attention: if the app is only in the tray (no taskbar button),
 * show a minimized taskbar icon and flash it — do not restore/focus the window.
 */
export function requestTaskbarAttention(win: BrowserWindow | null | undefined) {
  if (!win || win.isDestroyed()) return

  const focused = win.isVisible() && !win.isMinimized() && win.isFocused()
  if (focused) return

  win.setSkipTaskbar(false)

  if (!win.isVisible()) {
    // Bring back a taskbar button without activating the window.
    win.showInactive()
    win.minimize()
  } else if (!win.isMinimized() && !win.isFocused()) {
    // Visible but unfocused — flash only.
  }

  win.flashFrame(true)
}

export function clearTaskbarAttention(win: BrowserWindow | null | undefined) {
  if (!win || win.isDestroyed()) return
  win.flashFrame(false)
}
