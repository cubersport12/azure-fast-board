import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Navigate, createHashRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from '@/components/app-shell'
import { BoardPage } from '@/features/board/board-page'
import { WorkItemDetailPage } from '@/features/work-item-detail/work-item-detail-page'
import { WorkItemsPage } from '@/features/work-items/work-items-page'
import { MattermostBoardPage } from '@/features/mattermost-board/mattermost-board-page'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

// Data router (not declarative <HashRouter>): useBlocker in the detail page
// requires DataRouterContext, which only data routers provide.
const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/board" replace /> },
      { path: '/board', element: <BoardPage /> },
      { path: '/work-items', element: <WorkItemsPage /> },
      { path: '/work-items/:id', element: <WorkItemDetailPage /> },
      { path: '/mattermost-board', element: <MattermostBoardPage /> },
    ],
  },
])

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
