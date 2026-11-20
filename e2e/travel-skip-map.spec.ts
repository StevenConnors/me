import { join } from 'node:path';

import { expect, test } from '@playwright/test';

test('keyboard users can skip every public and editable regional map', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const route of ['/travel', '/admin/travel']) {
    await page.goto(route);
    for (const region of ['Countries', 'US states', 'Japan prefectures']) {
      const tab = page.getByRole('tab', { name: region, exact: true });
      await tab.click();
      if (route === '/admin/travel') {
        await expect(page.getByRole('searchbox', { name: 'Search places' })).toBeEnabled();
        await page.getByRole('checkbox').last().focus();
      } else {
        await tab.focus();
      }
      await page.keyboard.press('Tab');
      if (route === '/travel' && region === 'Countries') {
        const filename = `travel-skip-${process.env.SKIP_MAP_STAGE ?? 'after'}.png`;
        const path = process.env.EVIDENCE_DIR ? join(process.env.EVIDENCE_DIR, filename) : testInfo.outputPath(filename);
        await page.screenshot({ path, style: 'nextjs-portal {display:none}' });
      }
      const skip = page.getByRole('link', { name: 'Skip map', exact: true });
      await expect(skip).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('group', { name: 'End of map', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('[data-region-code]:focus')).toHaveCount(0);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/travel');
  await page.getByRole('tab', { name: 'Countries', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip map', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await testInfo.attach('e2e-fixture-skip-map-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
  await testInfo.attach('e2e-fixture-skip-map.json', { body: JSON.stringify({ regions: 3, publicAndAdmin: true, mobileWidth: 390 }), contentType: 'application/json' });
  expect(errors).toEqual([]);
});
