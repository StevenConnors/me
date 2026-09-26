import { writeFile } from 'node:fs/promises';

import { MongoClient } from 'mongodb';
import { expect, test } from '@playwright/test';

const sampleImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+9+vWAAAAAElFTkSuQmCC',
  'base64',
);

test('uploaded GPS metadata enriches media and drives country suggestions without a VLM call', async ({ page }) => {
  test.setTimeout(90_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  const filenames = ['gps-eg-fixture.png', 'gps-us-fixture.png'];
  const mediaIds: string[] = [];
  const collectionIds: string[] = [];
  const artifact: { uploaded: string[]; countries: Record<string, string | null>; suggestions: Record<string, string[]>; deletedEnrichment: boolean } = {
    uploaded: [], countries: {}, suggestions: {}, deletedEnrichment: false,
  };
  let connected = false;

  try {
    await mongo.connect();
    connected = true;
    await page.goto('/admin/media');
    await expect(page.getByRole('heading', { name: 'Media' })).toBeVisible();

    for (const filename of filenames) {
      const finalizedResponse = page.waitForResponse((response) =>
        response.url().endsWith('/api/admin/media/finalize') && response.request().method() === 'POST',
      );
      await page.locator('input[type=file]').first().setInputFiles({ name: filename, mimeType: 'image/png', buffer: sampleImage });
      const finalized = await finalizedResponse;
      expect(finalized.ok()).toBe(true);
      const { media } = await finalized.json() as { media: { _id: string } };
      mediaIds.push(media._id);
    }
    artifact.uploaded = [...mediaIds];

    const db = mongo.db();
    const expectedCountries = ['EG', 'US'];
    for (let index = 0; index < mediaIds.length; index += 1) {
      const mediaAssetId = mediaIds[index];
      await expect.poll(async () => {
        const enrichment = await db.collection('media_enrichments').findOne({ mediaAssetId });
        artifact.countries[filenames[index]] = (enrichment?.countryCode as string | undefined) ?? null;
        return enrichment?.countryCode;
      }, { timeout: 20_000, intervals: [100, 250, 500, 1000] }).toBe(expectedCountries[index]);
    }

    const countryNames = ['Egypt', 'United States'];
    for (let index = 0; index < expectedCountries.length; index += 1) {
      const countryCode = expectedCountries[index];
      const created = await page.request.post('/api/admin/collections', {
        data: { name: `${countryNames[index]} upload suggestion`, suggestionRule: { kind: 'country', countryCode } },
      });
      expect(created.status()).toBe(201);
      const collectionId = (await created.json() as { collection: { _id: string } }).collection._id;
      collectionIds.push(collectionId);
      const response = await page.request.get(`/api/admin/collections/${collectionId}/suggestions`);
      expect(response.ok()).toBe(true);
      const { suggestions } = await response.json() as { suggestions: Array<{ media: { _id: string }; reasons: string[] }> };
      artifact.suggestions[countryCode] = suggestions.map(({ media }) => media._id);
      expect(artifact.suggestions[countryCode]).toContain(mediaIds[index]);
      expect(suggestions.find(({ media }) => media._id === mediaIds[index])?.reasons.join(' ')).toContain(countryNames[index]);
      expect(artifact.suggestions[countryCode]).not.toContain(mediaIds[1 - index]);
    }

    const deletedMedia = await page.request.delete(`/api/admin/media/${mediaIds[1]}`);
    expect(deletedMedia.ok()).toBe(true);
    await expect.poll(() => db.collection('media_enrichments').findOne({ mediaAssetId: mediaIds[1] })).toBeNull();
    artifact.deletedEnrichment = true;

    const path = test.info().outputPath('media-enrichment-result.json');
    await writeFile(path, JSON.stringify(artifact, null, 2));
    await test.info().attach('media-enrichment-result.json', { path, contentType: 'application/json' });
  } finally {
    for (const id of collectionIds) await page.request.delete(`/api/admin/collections/${id}`);
    for (const id of mediaIds) await page.request.delete(`/api/admin/media/${id}`);
    if (connected) await mongo.close();
  }
});
