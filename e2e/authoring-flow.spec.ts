import { expect, test } from '@playwright/test';

const sampleImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+9+vWAAAAAElFTkSuQmCC',
  'base64',
);

test('an author can create, revise, publish, view, and delete a journey', async ({ page }) => {
  test.setTimeout(60_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const title = `E2E coast walk ${suffix}`;
  const updatedTitle = `${title} revised`;
  const slug = `e2e-coast-walk-${suffix}`;
  const firstText = 'A small cove appeared as the rain lifted.';
  const revisedText = 'A small cove appeared as the rain lifted, and the gulls returned.';
  const publicUrl = `/stories/${slug}`;
  let journeyId: string | undefined;
  let mediaId: string | undefined;

  try {
    await page.goto('/admin/journeys');
    await expect(page.getByRole('heading', { name: 'Journeys' })).toBeVisible();

    await page.getByRole('button', { name: 'New journey' }).click();
    await expect(page).toHaveURL(/\/admin\/journeys\/[a-f0-9]{24}\/edit$/, { timeout: 20_000 });
    const editUrl = page.url();
    journeyId = editUrl.match(/\/journeys\/([a-f0-9]{24})\/edit$/)?.[1];
    expect(journeyId).toBeTruthy();

    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Public slug').fill(slug);
    await page.getByLabel('Summary').fill('A browser-tested publishing workflow.');
    await page.locator('.ProseMirror').fill(firstText);
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();

    await page.goto('/admin/media');
    const finalizeResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/admin/media/finalize') && response.request().method() === 'POST',
    );
    await page.locator('input[type=file]').setInputFiles({
      name: 'sample-image.png',
      mimeType: 'image/png',
      buffer: sampleImage,
    });
    const finalized = await finalizeResponse;
    expect(finalized.ok()).toBe(true);
    mediaId = (await finalized.json() as { media: { _id: string } }).media._id;
    await expect(page.getByText('sample-image.png', { exact: true })).toBeVisible();
    await page.getByLabel('Alt text').fill('A small cove after rain');
    await page.getByRole('button', { name: 'Save media details' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();

    await page.goto(editUrl);
    await page.getByLabel('Cover image').selectOption(mediaId);
    await page.getByLabel('Add photographs from the library').selectOption([mediaId]);
    await page.getByRole('button', { name: 'Add selected' }).click();
    await page.getByLabel('Alt text', { exact: true }).fill('A small cove after rain');
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Publish journey' }).click();
    await expect(page.getByText('Published from a new immutable revision.')).toBeVisible();

    await page.goto(publicUrl);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText(firstText)).toBeVisible();
    await expect(page.getByAltText('A small cove after rain')).toHaveCount(2);

    await page.goto(editUrl);
    await page.getByLabel('Title').fill(updatedTitle);
    await page.locator('.ProseMirror').fill(revisedText);
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Publish update' }).click();
    await expect(page.getByText('Published from a new immutable revision.')).toBeVisible();

    await page.goto(publicUrl);
    await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();
    await expect(page.getByText(revisedText)).toBeVisible();

    await page.goto(editUrl);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete journey' }).click();
    await expect(page).toHaveURL('/admin/journeys');
    await expect(page.getByText(updatedTitle, { exact: true })).toHaveCount(0);

    const deletedPage = await page.goto(publicUrl);
    expect(deletedPage?.status()).toBe(404);
  } finally {
    // Keep a failed local run from accumulating test-only journeys or media.
    if (journeyId) await page.request.delete(`/api/admin/journeys/${journeyId}`);
    if (mediaId) await page.request.delete(`/api/admin/media/${mediaId}`);
  }
});
