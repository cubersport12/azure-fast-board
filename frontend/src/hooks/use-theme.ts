import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AppSettings } from '../../shared/types'
import { queryKeys, useSettings } from '@/hooks/use-azure'
import { requireAzureApi } from '@/lib/azure-api'

export type ThemePreference = AppSettings['theme']
export type ResolvedTheme = 'light' | 'dark'

const THEME_ORDER: ThemePreference[] = ['light', 'dark', 'system']
const THEME_STORAGE_KEY = 'afb-theme'

function usePrefersDark() {
  const [prefersDark, setPrefersDark] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setPrefersDark(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return prefersDark
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}

export function applyResolvedTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
}

export function readCachedThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // ignore
  }
  return 'system'
}

export function cacheThemePreference(theme: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore
  }
}

/** Apply theme ASAP (before React settings load) to avoid a light flash. */
export function bootstrapTheme() {
  const preference = readCachedThemePreference()
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  applyResolvedTheme(resolveTheme(preference, prefersDark))
}

export function useTheme() {
  const { data: settings } = useSettings()
  const qc = useQueryClient()
  const prefersDark = usePrefersDark()
  const preference: ThemePreference = settings?.theme ?? readCachedThemePreference()
  const resolved = useMemo(
    () => resolveTheme(preference, prefersDark),
    [preference, prefersDark],
  )

  useEffect(() => {
    applyResolvedTheme(resolved)
    cacheThemePreference(preference)
  }, [resolved, preference])

  const setTheme = async (theme: ThemePreference) => {
    cacheThemePreference(theme)
    applyResolvedTheme(resolveTheme(theme, prefersDark))
    await requireAzureApi().updateSettings({ theme })
    await qc.invalidateQueries({ queryKey: queryKeys.settings })
  }

  const cycleTheme = async () => {
    const index = THEME_ORDER.indexOf(preference)
    const next = THEME_ORDER[(index + 1) % THEME_ORDER.length]
    await setTheme(next)
  }

  return { preference, resolved, setTheme, cycleTheme }
}

export function themeLabel(preference: ThemePreference) {
  if (preference === 'light') return 'Светлая'
  if (preference === 'dark') return 'Тёмная'
  return 'Системная'
}
