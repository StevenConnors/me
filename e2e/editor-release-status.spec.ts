import { expect, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

import type { MediaAsset } from '../lib/media/schemas';
import { makeHeldPlacesDocument, makeJourney, READY_MEDIA_ID } from '../tests/journeys/fixtures';

test('journal separates local saves from the live revision across reloads', async ({ page }) => {
  test.setTimeout(90_000);
  const client = await MongoClient.connect(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  const db = client.db();
  const id = new ObjectId();
  const mediaId = new ObjectId().toHexString();
  const journey = makeJourney({ _id: id, title: 'A quiet coast', slug: `status-${id}`, draftDocument: makeHeldPlacesDocument() });
  journey.cover = { mediaAssetId: mediaId, role: 'cover', layout: { desktop: 'full', mobile: 'full' } };
  journey.draftDocument = JSON.parse(JSON.stringify(journey.draftDocument).split(READY_MEDIA_ID).join(mediaId));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await db.collection('journeys').insertOne(journey);
    await db.collection<MediaAsset>('media_assets').insertOne({ _id: mediaId, schemaVersion: 1,
      provider: 'cloudinary', providerAssetId: mediaId, providerPublicId: mediaId,
      resourceType: 'image', deliveryType: 'upload', originalFilename: 'fixture.jpg',
      format: 'jpg', width: 1, height: 1, bytes: 1, tags: [], showInPhotos: false,
      status: 'ready', altText: 'Fixture coast', createdAt: new Date(), updatedAt: new Date() });
    await page.goto(`/admin/journeys/${id}/edit`);
    await page.getByRole('region', { name: 'Publish journey' }).screenshot({ path: test.info().outputPath('journal-initial.png') });
    await expect(page.getByText('Never published', { exact: true })).toBeVisible();
    await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View public journey ↗' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Publish journey', exact: true }).click();
    await expect(page.getByText('Live · no unpublished changes', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Live · no unpublished changes', { exact: true })).toBeVisible();
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.getByLabel('Title', { exact: true }).fill('A quieter coast');
    await expect(page.getByText('Local changes · not saved', { exact: true })).toBeVisible();
    await expect(page.getByText('Live · unpublished changes', { exact: true })).toBeVisible();
    await page.getByLabel('Title', { exact: true }).fill('A quiet coast');
    await expect(page.getByText('Live · no unpublished changes', { exact: true })).toBeVisible();
    await page.getByLabel('Title', { exact: true }).fill('A quieter coast');
    const save = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().endsWith(`/journeys/${id}`));
    await page.getByRole('button', { name: 'Save now' }).click();
    expect((await save).ok()).toBe(true);
    await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
    await page.clock.resume();
    await page.reload();
    await expect(page.getByText('Live · unpublished changes', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View public journey ↗' })).toHaveAttribute('href', `/stories/${journey.slug}`);
    await test.info().attach('e2e-fixture-journal-release.png', { body: await page.getByRole('region', { name: 'Publish journey' }).screenshot(), contentType: 'image/png' });
    await page.getByRole('button', { name: 'Publish update', exact: true }).click();
    await expect(page.getByText('Live · no unpublished changes', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    await test.info().attach('e2e-fixture-journal-status.json', { body: JSON.stringify({ savedDraftSurvivedReload: true, liveLink: journey.slug, errors }), contentType: 'application/json' });
  } finally {
    await db.collection('journeys').deleteOne({ _id: id });
    await db.collection('journey_revisions').deleteMany({ journeyId: id });
    await db.collection('media_assets').deleteOne({ _id: mediaId });
    await client.close();
  }
});

test('Photos gates restore on a live snapshot and distinguishes queued saves', async ({ page }) => {
  test.setTimeout(90_000);
  const client = await MongoClient.connect(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  const db = client.db();
  const pages = db.collection<{ _id: string }>('photos_pages');
  const original = await pages.findOne({ _id: 'photos' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  let release = () => {};
  try {
    const now = new Date();
    await pages.replaceOne({ _id: 'photos' }, { _id: 'photos', schemaVersion: 1,
      draftDocument: { schemaVersion: 1, blocks: [] }, draftVersion: 0,
      createdAt: now, updatedAt: now }, { upsert: true });
    await page.goto('/admin/photos');
    await page.locator('[class*="toolbarMain"]').screenshot({ path: test.info().outputPath('photos-initial.png') });
    await page.locator('[class*="toolbar_"]').screenshot({ path: test.info().outputPath('photos-toolbar.png') });
    await expect(page.getByText('Never published', { exact: true })).toBeVisible();
    await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restore last published' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'View public Photos ↗' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByText('Live · no unpublished changes', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restore last published' })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'View public Photos ↗' })).toHaveAttribute('href', '/photos');
    await page.reload();
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.getByRole('button', { name: 'Insert section at top', exact: true }).click();
    await expect(page.getByText('Local changes · not saved', { exact: true })).toBeVisible();
    await expect(page.getByText('Live · unpublished changes', { exact: true })).toBeVisible();
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/admin/photos-page/draft', async (route) => { const response = await route.fetch(); await held; await route.fulfill({ response }); });
    await page.clock.fastForward(600);
    await expect(page.getByText('Saving…', { exact: true })).toBeVisible();
    await page.getByLabel('Section heading').fill('Still only a draft');
    await expect(page.getByText('Saving…', { exact: true })).toBeVisible();
    release();
    await page.clock.resume();
    await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
    await expect.poll(async () => JSON.stringify(await pages.findOne({ _id: 'photos' }))).toContain('Still only a draft');
    await page.reload();
    await expect(page.getByText('Live · unpublished changes', { exact: true })).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Restore last published' }).click();
    await expect(page.getByText('Live · no unpublished changes', { exact: true })).toBeVisible();
    await expect(page.getByText('Photos, soon.', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await test.info().attach('e2e-fixture-photos-release-390.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(errors).toEqual([]);
    await test.info().attach('e2e-fixture-photos-status.json', { body: JSON.stringify({ restoredLiveSnapshot: true, errors }), contentType: 'application/json' });
  } finally {
    release();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    if (original) await pages.replaceOne({ _id: 'photos' }, original);
    else await pages.deleteOne({ _id: 'photos' });
    await client.close();
  }
});

test('discarding before first Photos publication is not a version conflict', async ({ request }) => {
  const client = await MongoClient.connect(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  const pages = client.db().collection<{ _id: string }>('photos_pages');
  const original = await pages.findOne({ _id: 'photos' });
  try {
    const now = new Date();
    await pages.replaceOne({ _id: 'photos' }, { _id: 'photos', schemaVersion: 1,
      draftDocument: { schemaVersion: 1, blocks: [] }, draftVersion: 0,
      createdAt: now, updatedAt: now }, { upsert: true });
    const response = await request.post('/api/admin/photos-page/discard', { data: { expectedVersion: 0 } });
    expect(response.status()).toBe(422);
    expect((await response.json()).error.code).toBe('PHOTOS_NOT_PUBLISHED');
    expect(await pages.findOne({ _id: 'photos' })).toMatchObject({ draftVersion: 0 });
  } finally {
    if (original) await pages.replaceOne({ _id: 'photos' }, original);
    else await pages.deleteOne({ _id: 'photos' });
    await client.close();
  }
});
