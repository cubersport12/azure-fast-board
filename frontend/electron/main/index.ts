import {
  app,
  BrowserWindow,
  globalShortcut,
  Menu,
  nativeImage,
  shell,
  Tray,
} from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { IPC_CHANNELS } from '../../shared/ipc'
import { registerIpcHandlers } from './ipc'
import { bindTrayAttention, clearTaskbarAttention } from './notifications/attention'
import { getSettings } from './store'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

if (process.platform === 'win32' && os.release().startsWith('6.1')) {
  app.disableHardwareAcceleration()
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.azurefastboard.app')
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let tray: Tray | null = null
const preload = path.join(__dirname, '../preload/index.cjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

function createTrayIcon(alert = false) {
  const size = 16
  const canvas = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4
      const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1
      const board = x > 3 && x < 12 && y > 3 && y < 12
      // Small badge in the corner for "has notifications".
      const badge = alert && x >= 10 && y <= 5 && x + y >= 12
      if (badge) {
        canvas[idx] = 244
        canvas[idx + 1] = 63
        canvas[idx + 2] = 94
        canvas[idx + 3] = 255
      } else if (edge || board) {
        canvas[idx] = alert ? 244 : 14
        canvas[idx + 1] = alert ? 63 : 165
        canvas[idx + 2] = alert ? 94 : 233
        canvas[idx + 3] = 255
      } else {
        canvas[idx + 3] = 0
      }
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size })
}

function showWindow() {
  clearTaskbarAttention(win)
  if (!win) {
    void createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function hideWindow() {
  win?.hide()
}

function sendToRenderer(channel: string, ...args: unknown[]) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args)
  }
}

function parseAccelerator(accelerator: string) {
  const parts = accelerator
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  if (!parts.length) return null

  const key = parts[parts.length - 1].toLowerCase()
  const mods = parts.slice(0, -1).map((part) => part.toLowerCase())

  let code: string | null = null
  if (key === 'space') code = 'Space'
  else if (/^[a-z]$/.test(key)) code = `Key${key.toUpperCase()}`
  else if (/^[0-9]$/.test(key)) code = `Digit${key}`
  else if (key === 'esc' || key === 'escape') code = 'Escape'
  else if (key === '/' || key === 'slash') code = 'Slash'

  if (!code) return null

  return {
    code,
    control: mods.some((m) =>
      ['ctrl', 'control', 'cmd', 'command', 'commandorcontrol', 'cmdorctrl'].includes(m),
    ),
    shift: mods.includes('shift'),
    alt: mods.some((m) => m === 'alt' || m === 'option'),
  }
}

function inputMatchesAccelerator(
  input: { code: string; control: boolean; shift: boolean; alt: boolean; meta: boolean },
  accelerator: string,
) {
  const parsed = parseAccelerator(accelerator)
  if (!parsed) return false
  const mod = input.control || input.meta
  return (
    input.code === parsed.code &&
    mod === parsed.control &&
    input.shift === parsed.shift &&
    input.alt === parsed.alt
  )
}

function registerShortcuts() {
  globalShortcut.unregisterAll()
  const settings = getSettings()

  const toggleOk = globalShortcut.register(settings.globalHotkey, () => {
    if (!win) {
      void createWindow()
      return
    }
    if (win.isVisible() && win.isFocused()) hideWindow()
    else showWindow()
  })

  const createOk = globalShortcut.register(settings.quickCreateHotkey, () => {
    showWindow()
    sendToRenderer(IPC_CHANNELS.eventShowQuickCreate)
  })

  if (!toggleOk) console.warn('Failed to register global hotkey', settings.globalHotkey)
  if (!createOk) console.warn('Failed to register quick create hotkey', settings.quickCreateHotkey)
}

function attachLayoutIndependentShortcuts(browserWindow: BrowserWindow) {
  browserWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const settings = getSettings()

    // Physical key codes — independent of RU/EN layout.
    if (inputMatchesAccelerator(input, settings.globalHotkey)) {
      event.preventDefault()
      if (browserWindow.isVisible() && browserWindow.isFocused()) hideWindow()
      else showWindow()
      return
    }

    if (inputMatchesAccelerator(input, settings.quickCreateHotkey)) {
      event.preventDefault()
      showWindow()
      sendToRenderer(IPC_CHANNELS.eventShowQuickCreate)
    }
  })
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Показать Azure Fast Board', click: () => showWindow() },
    {
      label: 'Быстрое создание',
      click: () => {
        showWindow()
        sendToRenderer(IPC_CHANNELS.eventShowQuickCreate)
      },
    },
    {
      label: 'Палитра команд',
      click: () => {
        showWindow()
        sendToRenderer(IPC_CHANNELS.eventShowCommandPalette)
      },
    },
    { type: 'separator' },
    {
      label: 'Канбан',
      click: () => {
        showWindow()
        sendToRenderer(IPC_CHANNELS.eventNavigate, '/board')
      },
    },
    {
      label: 'Рабочие элементы',
      click: () => {
        showWindow()
        sendToRenderer(IPC_CHANNELS.eventNavigate, '/work-items')
      },
    },
    { type: 'separator' },
    { label: 'Выход', click: () => app.quit() },
  ])
}

async function createWindow() {
  const settings = getSettings()

  win = new BrowserWindow({
    title: 'Azure Fast Board',
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: !settings.launchMinimized,
    icon: path.join(process.env.VITE_PUBLIC!, 'favicon.ico'),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    await win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    await win.loadFile(indexHtml)
  }

  win.on('close', (event) => {
    if (getSettings().hideToTrayOnClose && !(app as unknown as { isQuitting?: boolean }).isQuitting) {
      event.preventDefault()
      hideWindow()
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  attachLayoutIndependentShortcuts(win)

  win.on('focus', () => {
    clearTaskbarAttention(win)
  })
}

app.whenReady().then(async () => {
  registerIpcHandlers(() => win)
  await createWindow()

  const idleIcon = createTrayIcon(false)
  const alertIcon = createTrayIcon(true)
  tray = new Tray(idleIcon)
  tray.setToolTip('Azure Fast Board')
  tray.setContextMenu(buildTrayMenu())
  tray.on('double-click', () => showWindow())
  tray.on('click', () => {
    // Single click also clears blink when user acknowledges the tray.
    if (win?.isVisible()) clearTaskbarAttention(win)
  })
  bindTrayAttention(tray, { idle: idleIcon, alert: alertIcon })

  registerShortcuts()
})

app.on('before-quit', () => {
  ;(app as unknown as { isQuitting?: boolean }).isQuitting = true
  globalShortcut.unregisterAll()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  win = null
  // Keep running in tray on Windows/Linux.
})

app.on('second-instance', () => {
  showWindow()
})

app.on('activate', () => {
  showWindow()
})

// Keep require available for optional native modules in future packaging.
void require
