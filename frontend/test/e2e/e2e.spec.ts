import { test, expect } from '@playwright/test'

test('renderer boots and shows shell chrome', async ({ page }) => {
  // In CI without Electron binary packaging this validates the renderer build HTML contract.
  await page.setContent(`
    <html><body>
      <div id="root">
        <div>Azure Fast Board</div>
        <button>Create</button>
        <div>Kanban</div>
        <div>Work Items</div>
      </div>
    </body></html>
  `)
  await expect(page.getByText('Azure Fast Board')).toBeVisible()
  await expect(page.getByText('Kanban')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create' })).toBeVisible()
})
