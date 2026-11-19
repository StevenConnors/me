import { expect, test } from '@playwright/test';

const sampleImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+9+vWAAAAAElFTkSuQmCC',
  'base64',
);

test('draft slug edits leave the live URL alone until the rename is published', async ({ page }) => {
  test.setTimeout(90_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const title = `E2E harbour walk ${suffix}`;
  const liveSlug = `e2e-harbour-walk-${suffix}`;
  const renamedSlug = `${liveSlug}-renamed`;
  const bodyText = 'The ferry horn carried across the harbour.';
  let journeyId: string | undefined;
  let mediaId: string | undefined;

  try {
    await page.goto('/admin/journeys');
    await page.getByRole('button', { name: 'New journey' }).click();
    await expect(page).toHaveURL(/\/admin\/journeys\/[a-f0-9]{24}\/edit$/, { timeout: 20_000 });
    const editUrl = page.url();
    journeyId = editUrl.match(/\/journeys\/([a-f0-9]{24})\/edit$/)?.[1];

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

    await page.goto(editUrl);
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Public slug').fill(liveSlug);
    await page.getByLabel('Summary').fill('Checks that live URLs ignore draft slugs.');
    await page.getByLabel('Cover image').selectOption(mediaId);
    await page.locator('.ProseMirror').fill(bodyText);
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Publish journey' }).click();
    await expect(page.getByText('Published from a new immutable revision.')).toBeVisible();

    // Cases 1–3: an autosaved slug edit is only a draft.
    await page.getByLabel('Public slug').fill(renamedSlug);
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View public journey ↗' }))
      .toHaveAttribute('href', `/stories/${liveSlug}`);

    const liveResponse = await page.goto(`/stories/${liveSlug}`);
    expect(liveResponse?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText(bodyText)).toBeVisible();

    const draftResponse = await page.goto(`/stories/${renamedSlug}`);
    expect(draftResponse?.status()).toBe(404);

    // Cases 4–5: publishing the rename moves the live URL and redirects the old one.
    await page.goto(editUrl);
    await page.getByRole('button', { name: 'Publish update' }).click();
    await expect(page.getByText('Published from a new immutable revision.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'View public journey ↗' }))
      .toHaveAttribute('href', `/stories/${renamedSlug}`);

    const renamedResponse = await page.goto(`/stories/${renamedSlug}`);
    expect(renamedResponse?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();

    const oldUrl = await page.request.get(`/stories/${liveSlug}`, { maxRedirects: 0 });
    expect(oldUrl.status()).toBe(307);
    expect(new URL(oldUrl.headers().location, page.url()).pathname).toBe(`/stories/${renamedSlug}`);
    await page.goto(`/stories/${liveSlug}`);
    await expect(page).toHaveURL(new RegExp(`/stories/${renamedSlug}$`));
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  } finally {
    if (journeyId) await page.request.delete(`/api/admin/journeys/${journeyId}`);
    if (mediaId) await page.request.delete(`/api/admin/media/${mediaId}`);
  }
});
