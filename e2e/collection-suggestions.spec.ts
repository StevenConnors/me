import { writeFile } from 'node:fs/promises';

import { MongoClient, ObjectId } from 'mongodb';
import { expect, test } from '@playwright/test';

test('collection suggestions rank enriched media, explain matches, and require author review', async ({ page }) => {
  test.setTimeout(90_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  const runId = new ObjectId().toHexString();
  const mediaIds = Array.from({ length: 6 }, () => new ObjectId().toHexString());
  const collectionIds: string[] = [];
  const artifact = {
    runId,
    subjectSuggestions: [] as string[],
    countrySuggestions: [] as string[],
    reasonsShown: false,
    suggestionsRequireReview: false,
    acceptedSuggestionAdded: false,
    dismissalPersisted: false,
  };
  let connected = false;

  try {
    await mongo.connect();
    connected = true;
    const db = mongo.db();
    const now = new Date();
    const mediaAssets = mediaIds.map((id, index) => ({
      _id: id,
      schemaVersion: 1,
      provider: 'cloudinary',
      providerAssetId: `e2e-${id}`,
      providerPublicId: `e2e/${id}`,
      resourceType: 'image',
      deliveryType: 'upload',
      version: 1,
      originalFilename: `collection-suggest-${runId}-${index}.jpg`,
      format: 'jpg',
      width: 800,
      height: 600,
      bytes: 100,
      tags: index === 4 ? ['cat'] : [],
      altText: ['Cat on a sofa', 'Two cats playing', 'Egyptian temple', 'Mountain lake', 'Tag-only cat', 'Caterpillar in a garden'][index],
      showInPhotos: true,
      status: 'ready',
      createdAt: new Date(now.getTime() + index),
      updatedAt: now,
    }));
    await db.collection<{ _id: string }>('media_assets').insertMany(mediaAssets);
    await db.collection('media_enrichments').insertMany([
      { mediaAssetId: mediaIds[0], concepts: ['cat'], description: 'A cat resting on a sofa', updatedAt: now },
      { mediaAssetId: mediaIds[1], concepts: ['cats', 'kitten'], description: 'Two cats playing together', updatedAt: now },
      { mediaAssetId: mediaIds[2], concepts: ['temple', 'ancient architecture'], description: 'An ancient temple in Egypt', countryCode: 'EG', updatedAt: now },
      { mediaAssetId: mediaIds[3], concepts: ['mountain', 'lake'], description: 'A mountain lake in Japan', countryCode: 'JP', updatedAt: now },
      { mediaAssetId: mediaIds[5], concepts: ['caterpillar', 'garden'], description: 'An Egyptian art display in a Japanese museum', countryCode: 'JP', updatedAt: now },
    ]);

    await page.goto('/admin/media');
    await expect(page.getByRole('heading', { name: 'Media' })).toBeVisible();
    await page.getByLabel('New collection name').fill(`Cats ${runId}`);
    await page.getByLabel('Subject to suggest').fill('cats');
    const catsCreatedResponse = page.waitForResponse((response) => response.url().endsWith('/api/admin/collections') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create collection' }).click();
    const catsCreated = await catsCreatedResponse;
    expect(catsCreated.status()).toBe(201);
    const catsCollectionId = (await catsCreated.json() as { collection: { _id: string } }).collection._id;
    collectionIds.push(catsCollectionId);
    await expect(page.getByRole('article', { name: `collection-suggest-${runId}-0.jpg` })).toBeVisible();
    const emptyCats = await page.request.get(`/api/admin/collections/${catsCollectionId}`);
    expect(emptyCats.ok()).toBe(true);
    expect((await emptyCats.json() as { collection: { mediaAssetIds: string[] } }).collection.mediaAssetIds).toEqual([]);

    await page.getByLabel('New collection name').fill(`Egypt ${runId}`);
    await page.getByLabel('Suggestion type').selectOption('country');
    await page.getByLabel('Country').selectOption('EG');
    const egyptCreatedResponse = page.waitForResponse((response) => response.url().endsWith('/api/admin/collections') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create collection' }).click();
    const egyptCreated = await egyptCreatedResponse;
    expect(egyptCreated.status()).toBe(201);
    const egyptCollectionId = (await egyptCreated.json() as { collection: { _id: string } }).collection._id;
    collectionIds.push(egyptCollectionId);

    const initialCats = await page.request.get(`/api/admin/collections/${catsCollectionId}/suggestions`);
    expect(initialCats.ok()).toBe(true);
    const catsPayload = await initialCats.json() as { suggestions: Array<{ media: { _id: string }; reasons: string[] }> };
    expect(catsPayload.suggestions.map(({ media }) => media._id)).toEqual(expect.arrayContaining(mediaIds.slice(0, 2)));
    expect(catsPayload.suggestions.map(({ media }) => media._id)).toContain(mediaIds[4]);
    expect(catsPayload.suggestions.map(({ media }) => media._id)).not.toContain(mediaIds[2]);
    expect(catsPayload.suggestions.map(({ media }) => media._id)).not.toContain(mediaIds[5]);
    expect(catsPayload.suggestions[0].reasons.length).toBeGreaterThan(0);
    artifact.subjectSuggestions = catsPayload.suggestions.map(({ media }) => media._id);

    const egyptSuggestions = await page.request.get(`/api/admin/collections/${egyptCollectionId}/suggestions`);
    expect(egyptSuggestions.ok()).toBe(true);
    const egyptPayload = await egyptSuggestions.json() as { suggestions: Array<{ media: { _id: string }; reasons: string[] }> };
    expect(egyptPayload.suggestions.map(({ media }) => media._id)).toContain(mediaIds[2]);
    expect(egyptPayload.suggestions.map(({ media }) => media._id)).not.toContain(mediaIds[3]);
    expect(egyptPayload.suggestions.map(({ media }) => media._id)).not.toContain(mediaIds[5]);
    artifact.countrySuggestions = egyptPayload.suggestions.map(({ media }) => media._id);

    await page.getByLabel('Filter by collection').selectOption(catsCollectionId);
    await page.getByRole('button', { name: 'Find suggestions', exact: true }).click();
    const firstCatFilename = `collection-suggest-${runId}-0.jpg`;
    const firstCat = page.getByRole('article', { name: firstCatFilename });
    await expect(firstCat).toBeVisible();
    await expect(firstCat.getByText(/cat/i)).toBeVisible();
    const suggestion = page.locator('article').filter({ hasText: `collection-suggest-${runId}-1.jpg` });
    await expect(suggestion).toBeVisible();
    await expect(suggestion.getByText(/cat/i)).toBeVisible();
    artifact.reasonsShown = true;
    const artifactScreenshot = test.info().outputPath('collection-suggestions-review.png');
    await page.screenshot({ path: artifactScreenshot, fullPage: true });
    await test.info().attach('collection-suggestions-review.png', { path: artifactScreenshot, contentType: 'image/png' });
    const beforeAccept = await page.request.get(`/api/admin/collections/${catsCollectionId}`);
    expect((await beforeAccept.json() as { collection: { mediaAssetIds: string[] } }).collection.mediaAssetIds).toEqual([]);
    await firstCat.getByRole('checkbox', { name: `Select ${firstCatFilename}` }).check();
    await page.getByRole('button', { name: 'Add selected suggestions', exact: true }).click();
    await expect(page.getByText('1 suggestion added to collection.', { exact: true })).toBeVisible();
    const afterAccept = await page.request.get(`/api/admin/collections/${catsCollectionId}`);
    expect((await afterAccept.json() as { collection: { mediaAssetIds: string[] } }).collection.mediaAssetIds).toContain(mediaIds[0]);
    artifact.acceptedSuggestionAdded = true;

    await suggestion.getByRole('button', { name: `Dismiss collection-suggest-${runId}-1.jpg`, exact: true }).click();
    await expect(suggestion).toBeHidden();

    const refreshed = await page.request.get(`/api/admin/collections/${catsCollectionId}/suggestions`);
    expect(refreshed.ok()).toBe(true);
    const refreshedPayload = await refreshed.json() as { suggestions: Array<{ media: { _id: string }; reasons: string[] }> };
    expect(refreshedPayload.suggestions.map(({ media }) => media._id)).not.toContain(mediaIds[0]);
    expect(refreshedPayload.suggestions.map(({ media }) => media._id)).not.toContain(mediaIds[1]);
    artifact.suggestionsRequireReview = true;
    artifact.dismissalPersisted = true;
  } finally {
    if (connected) {
      const db = mongo.db();
      await db.collection('media_enrichments').deleteMany({ mediaAssetId: { $in: mediaIds } });
      await db.collection('media_assets').deleteMany({ _id: { $in: mediaIds } });
      await mongo.close();
    }
    for (const id of collectionIds) await page.request.delete(`/api/admin/collections/${id}`);
    const path = test.info().outputPath('collection-suggestions-result.json');
    await writeFile(path, JSON.stringify(artifact, null, 2));
    await test.info().attach('collection-suggestions-result.json', { path, contentType: 'application/json' });
  }
});
