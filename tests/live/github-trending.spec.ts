import { expect, test } from '@playwright/test'

test('GitHub Trending MCP App loads live API data and refreshes through the host', async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 900 })
  await page.goto('/?app=trending')
  const app = page.frameLocator('section > iframe').frameLocator('iframe')

  await expect(page.getByText(/GitHub Trending \(weekly, All\):/)).toBeVisible({ timeout: 20_000 })
  await expect(app.getByRole('heading', { name: 'GitHub Trending' })).toBeVisible()
  await expect(app.getByTestId('repository-card').first()).toBeVisible()
  await expect(app.getByTestId('source-note')).toContainText('GitHub REST Search API')
  await expect(app.getByTestId('status')).toContainText(/updated|cached/i)
  await expect.poll(async () => (await page.locator('section > iframe').boundingBox())?.height ?? 0).toBeGreaterThan(500)

  await app.getByRole('button', { name: 'Today' }).click()
  await expect(app.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true')
  await expect(app.getByTestId('period-label')).toHaveText('Today', { timeout: 20_000 })
  await expect(app.getByTestId('status')).toContainText(/updated|cached/i, { timeout: 20_000 })
  await expect(app.getByTestId('repository-card').first()).toBeVisible()
  await expect(app.getByRole('alert')).toBeEmpty()
  await page.screenshot({ path: 'test-results/github-trending.png', fullPage: true })
})
