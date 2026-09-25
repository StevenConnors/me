import { expect, test } from '@playwright/test';

test('the legacy gallery route opens the published Photos page', async ({ page }) => {
  await page.goto('/gallery');
  await expect(page).toHaveURL(/\/photos$/);
});
