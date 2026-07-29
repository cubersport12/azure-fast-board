import { useCallback, useEffect } from 'react'
import { useSettings, useUpdateSettings } from '@/hooks/use-azure'
import { EMPTY_FILTERS, type WorkItemFilters } from '@/lib/work-item-filters'
import { useUiStore } from '@/stores/ui-store'

export function normalizeStoredFilters(
  raw?: Partial<WorkItemFilters> | null,
): WorkItemFilters {
  return {
    types: raw?.types ?? [],
    states: raw?.states ?? [],
    assignees: raw?.assignees ?? [],
    creators: raw?.creators ?? [],
    tags: raw?.tags ?? [],
  }
}

/** ponytail: module guard — hydrate settings.filters once across AppShell + pages. */
let filtersHydrated = false

/** Filters from ui-store, hydrated/persisted via AppSettings. */
export function usePersistedFilters() {
  const filters = useUiStore((s) => s.filters)
  const setFilters = useUiStore((s) => s.setFilters)
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()

  useEffect(() => {
    if (!settings || filtersHydrated) return
    filtersHydrated = true
    setFilters(normalizeStoredFilters(settings.filters))
  }, [settings, setFilters])

  const setAndPersist = useCallback(
    (next: WorkItemFilters) => {
      setFilters(next)
      void updateSettings.mutateAsync({ filters: next })
    },
    [setFilters, updateSettings],
  )

  return { filters: filters ?? EMPTY_FILTERS, setFilters: setAndPersist }
}
