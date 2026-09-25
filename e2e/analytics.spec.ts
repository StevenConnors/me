import { expect, test } from '@playwright/test';

test('admin analytics shows the production traffic setup state', async ({ page }) => {
  await page.goto('/admin/analytics');
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await expect(page.getByText(/Vercel Web Analytics is not configured/i)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/admin/analytics');
  await expect(page.getByRole('heading', { name: 'Visits over time' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Countries' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Most-viewed journeys' })).toBeVisible();

  await test.info().attach('analytics-traffic-e2e-result.json', {
    body: JSON.stringify({ scope: 'local E2E traffic dashboard', setupState: 'not-configured' }, null, 2),
    contentType: 'application/json',
  });
});
