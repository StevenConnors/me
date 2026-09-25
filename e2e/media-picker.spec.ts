import { expect, test } from '@playwright/test';

test('journey media picker shows searchable, paged library assets with previews and status', async ({ page }) => {
  let journeyId: string | undefined;
  const firstPage = Array.from({ length: 24 }, (_, index) => ({
    _id: `asset-${index}`,
    title: index === 0 ? 'Rainy cove' : undefined,
    originalFilename: index === 0 ? 'rainy-cove.jpg' : `island-${index}.jpg`,
    width: 1600,
    height: 1200,
    altText: 'A cove after rain',
    previewUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    captureDate: '2024-04-18',
    status: index === 1 ? 'processing' : 'ready',
  }));
  await page.route('**/api/admin/collections', (route) => route.fulfill({ json: {
    collections: [{ _id: 'collection-islands', name: 'Islands', mediaAssetIds: ['asset-0'], mediaCount: 1 }],
  } }));
  await page.route('**/api/admin/media?**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('collectionId') === 'collection-islands' || url.searchParams.get('q') === 'rainy') {
      await route.fulfill({ json: { media: [firstPage[0]], nextCursor: null } });
    } else if (url.searchParams.get('cursor')) {
      await route.fulfill({ json: { media: [{ ...firstPage[0], _id: 'asset-last', title: undefined, originalFilename: 'last-page.jpg' }], nextCursor: null } });
    } else {
      await route.fulfill({ json: { media: firstPage, nextCursor: 'next-page' } });
    }
  });

  await page.goto('/admin/journeys');
  await page.getByRole('button', { name: 'New journey' }).click();
  await expect(page).toHaveURL(/\/admin\/journeys\/[a-f0-9]{24}\/edit$/, { timeout: 20_000 });
  journeyId = page.url().match(/\/journeys\/([a-f0-9]{24})\/edit$/)?.[1];
  await page.getByRole('button', { name: 'Choose photographs' }).click();

  const library = page.getByRole('region', { name: 'Photograph library' });
  await expect(library.getByText('Rainy cove')).toBeVisible();
  await expect(library.locator('img').first()).toHaveAttribute('src', /sample\.jpg/);
  await expect(library.getByText('2024-04-18').first()).toBeVisible();
  await expect(library.getByText('Not ready')).toBeVisible();
  // The visible sentinel can advance the page before the manual button is used.
  await expect(library.getByText('last-page.jpg')).toBeVisible();

  await library.getByRole('combobox', { name: 'Collection' }).focus();
  await expect(library.getByRole('option', { name: 'Islands' })).toBeAttached();
  await library.getByRole('combobox', { name: 'Collection' }).selectOption('collection-islands');
  await expect(library.getByText('last-page.jpg')).toHaveCount(0);
  await expect(library.getByText('Rainy cove')).toBeVisible();
  await library.getByRole('combobox', { name: 'Collection' }).selectOption('');

  await library.getByLabel('Search library photographs').fill('rainy');
  await library.getByRole('button', { name: 'Search' }).click();
  await expect(library.getByText('Rainy cove')).toBeVisible();
  await expect(library.getByText('last-page.jpg')).toHaveCount(0);
  if (journeyId) await page.request.delete(`/api/admin/journeys/${journeyId}`);
});
