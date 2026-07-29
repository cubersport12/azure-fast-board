import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AppSettings,
  AssigneeIdentity,
  AreaPathsResult,
  BoardColumn,
  ConnectionConfig,
  CreateWorkItemInput,
  IterationPathsResult,
  PatchWorkItemInput,
  WorkItem,
  WorkItemDetail,
  WorkItemTypeInfo,
} from '../../shared/types'
import { requireAzureApi } from '@/lib/azure-api'
import { useUiStore } from '@/stores/ui-store'

export const queryKeys = {
  workItems: ['workItems'] as const,
  workItem: (id: number) => ['workItem', id] as const,
  columns: ['boardColumns'] as const,
  types: ['workItemTypes'] as const,
  assignees: ['assignees'] as const,
  currentUser: ['currentUser'] as const,
  areaPaths: ['areaPaths'] as const,
  iterationPaths: ['iterationPaths'] as const,
  connection: ['connection'] as const,
  settings: ['settings'] as const,
  views: ['views'] as const,
}

export function useWorkItems() {
  const ready = useUiStore((s) => s.connectionReady)
  return useQuery<WorkItem[]>({
    queryKey: queryKeys.workItems,
    queryFn: () => requireAzureApi().listWorkItems(),
    enabled: ready,
    refetchInterval: ready ? 30_000 : false,
  })
}

export function useWorkItem(id: number) {
  const ready = useUiStore((s) => s.connectionReady)
  return useQuery<WorkItemDetail>({
    queryKey: queryKeys.workItem(id),
    queryFn: () => requireAzureApi().getWorkItem(id),
    enabled: ready && Number.isFinite(id),
  })
}

export function useBoardColumns() {
  const ready = useUiStore((s) => s.connectionReady)
  return useQuery<BoardColumn[]>({
    queryKey: queryKeys.columns,
    queryFn: () => requireAzureApi().getBoardColumns(),
    enabled: ready,
  })
}

export function useWorkItemTypes() {
  const ready = useUiStore((s) => s.connectionReady)
  return useQuery<WorkItemTypeInfo[]>({
    queryKey: queryKeys.types,
    queryFn: () => requireAzureApi().getWorkItemTypes(),
    enabled: ready,
  })
}

export function useAssignees() {
  const ready = useUiStore((s) => s.connectionReady)
  return useQuery<AssigneeIdentity[]>({
    queryKey: queryKeys.assignees,
    queryFn: () => requireAzureApi().listAssignees(),
    enabled: ready,
    staleTime: 60_000,
  })
}

export function useCurrentUser() {
  const ready = useUiStore((s) => s.connectionReady)
  return useQuery<AssigneeIdentity>({
    queryKey: queryKeys.currentUser,
    queryFn: () => requireAzureApi().getCurrentUser(),
    enabled: ready,
    staleTime: 5 * 60_000,
  })
}

export function useAreaPaths() {
  const ready = useUiStore((s) => s.connectionReady)
  return useQuery<AreaPathsResult>({
    queryKey: queryKeys.areaPaths,
    queryFn: () => requireAzureApi().listAreaPaths(),
    enabled: ready,
    staleTime: 5 * 60_000,
  })
}

export function useIterationPaths() {
  const ready = useUiStore((s) => s.connectionReady)
  return useQuery<IterationPathsResult>({
    queryKey: queryKeys.iterationPaths,
    queryFn: () => requireAzureApi().listIterationPaths(),
    enabled: ready,
    staleTime: 5 * 60_000,
  })
}

export function useConnection() {
  return useQuery<ConnectionConfig | null>({
    queryKey: queryKeys.connection,
    queryFn: () => requireAzureApi().getConnection(),
  })
}

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: queryKeys.settings,
    queryFn: () => requireAzureApi().getSettings(),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) => requireAzureApi().updateSettings(patch),
    onSuccess: (settings) => {
      qc.setQueryData(queryKeys.settings, settings)
    },
  })
}

export function useCreateWorkItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateWorkItemInput) => {
      const selected = qc.getQueryData<AppSettings>(queryKeys.settings)?.selectedIterationPath?.trim()
      return requireAzureApi().createWorkItem({
        ...input,
        iterationPath: input.iterationPath?.trim() || selected || undefined,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.workItems })
    },
  })
}

export function useUpdateWorkItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PatchWorkItemInput) => requireAzureApi().updateWorkItem(input),
    onSuccess: (item: WorkItem) => {
      void qc.invalidateQueries({ queryKey: queryKeys.workItems })
      void qc.invalidateQueries({ queryKey: queryKeys.workItem(item.id) })
    },
  })
}

export function useMoveWorkItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      column,
      rev,
      state,
    }: {
      id: number
      column: string
      rev: number
      state?: string
    }) => requireAzureApi().moveWorkItem(id, column, rev, state),
    onMutate: async ({ id, column, state }) => {
      await qc.cancelQueries({ queryKey: queryKeys.workItems })
      const previous = qc.getQueryData<WorkItem[]>(queryKeys.workItems)
      const nextState = state || column
      qc.setQueryData<WorkItem[]>(queryKeys.workItems, (old) => {
        if (!old) return old
        return old.map((item) =>
          item.id === id
            ? { ...item, boardColumn: column, state: nextState }
            : item,
        )
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKeys.workItems, ctx.previous)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.workItems })
    },
  })
}
