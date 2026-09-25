import { expect, test } from '@playwright/test';

const sampleImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+9+vWAAAAAElFTkSuQmCC',
  'base64',
);

test('mobile navigation and a batch upload show completion with newest media first', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const mediaIds: string[] = [];
  page.on('response', async (response) => {
    if (response.url().endsWith('/api/admin/media/finalize') && response.ok()) {
      mediaIds.push((await response.json() as { media: { _id: string } }).media._id);
    }
  });

  try {
    await page.goto('/admin/journeys');
    await page.getByRole('button', { name: 'Open admin navigation' }).click();
    await page.getByRole('navigation', { name: 'Admin navigation' }).getByRole('link', { name: 'Photos' }).click();
    await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
    await page.getByRole('button', { name: 'Open admin navigation' }).click();
    await page.getByRole('navigation', { name: 'Admin navigation' }).getByRole('link', { name: 'Media' }).click();
    await expect(page.getByRole('heading', { name: 'Media' })).toBeVisible();

    await page.locator('input[type=file]').setInputFiles([
      { name: 'mobile-first.png', mimeType: 'image/png', buffer: sampleImage },
      { name: 'mobile-second.png', mimeType: 'image/png', buffer: sampleImage },
    ]);
    await expect(page.getByRole('status').filter({ hasText: '2 of 2 photos uploaded successfully' })).toBeVisible();
    await expect.poll(() => mediaIds.length).toBe(2);

    const cards = page.getByRole('region', { name: 'Media library' }).locator('article');
    await expect(cards.nth(0)).toContainText('sample-image.png');
    await expect(cards.nth(0).locator(`#media-date-${mediaIds[1]}`)).toHaveCount(1);
    await expect(cards.nth(1).locator(`#media-date-${mediaIds[0]}`)).toHaveCount(1);

    await page.screenshot({ path: testInfo.outputPath('mobile-admin-upload.png'), fullPage: true });
    await page.getByRole('button', { name: 'Open admin navigation' }).click();
    await page.getByRole('navigation', { name: 'Admin navigation' }).getByRole('link', { name: 'Journeys' }).click();
    await expect(page.getByRole('heading', { name: 'Journeys' })).toBeVisible();
  } finally {
    for (const mediaId of mediaIds) await page.request.delete(`/api/admin/media/${mediaId}`);
  }
});
