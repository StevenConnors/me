import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

const mongoUri = process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e';
const runId = new ObjectId().toHexString();
const mediaId = new ObjectId().toHexString();
const journeys = [
  { id: new ObjectId(), revisionId: new ObjectId(), slug: `travel-links-newer-${runId}`, title: `Kyoto travel ${runId.slice(-6)}`, status: 'published' },
  { id: new ObjectId(), revisionId: new ObjectId(), slug: `travel-links-older-${runId}`, title: `Osaka travel ${runId.slice(-6)}`, status: 'published' },
  { id: new ObjectId(), revisionId: new ObjectId(), slug: `travel-links-draft-${runId}`, title: `Draft travel ${runId.slice(-6)}`, status: 'draft' },
];
let originalTravel: Record<string, unknown> | null = null;

test.beforeAll(async () => {
  const client = await MongoClient.connect(mongoUri);
  const db = client.db();
  const now = new Date();
  originalTravel = await db.collection<{ _id: string }>('travel').findOne({ _id: 'travel' });
  await db.collection<{ _id: string } & Record<string, unknown>>('travel').replaceOne({ _id: 'travel' }, {
    _id: 'travel', schemaVersion: 1, selections: { countries: ['JP', 'FR'], usStates: [], japanPrefectures: [] }, version: 1, updatedAt: now,
  }, { upsert: true });
  await db.collection<{ _id: string } & Record<string, unknown>>('media_assets').insertOne({
    _id: mediaId, schemaVersion: 1, provider: 'cloudinary', providerAssetId: `e2e-${mediaId}`,
    providerPublicId: `e2e/${mediaId}`, resourceType: 'image', deliveryType: 'upload', version: 1,
    originalFilename: `travel-links-${runId}.jpg`, format: 'jpg', width: 1200, height: 800, bytes: 100,
    checksum: `e2e-${mediaId}`, tags: [], altText: 'Temple roof', status: 'ready', createdAt: now, updatedAt: now,
  });
  const document = {
    schemaVersion: 2, template: 'held-places-v1',
    chapters: [{ id: 'one', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fixture.' }] }] }, media: [] }],
  };
  for (let index = 0; index < journeys.length; index += 1) {
    const journey = journeys[index];
    const meta = {
      slug: journey.slug, title: journey.title, summary: `${journey.title} summary.`,
      locations: [{ id: 'jp', label: 'Japan', countryCode: 'JP' }],
      cover: { mediaAssetId: mediaId, role: 'cover', layout: { desktop: 'full', mobile: 'full' }, decorative: false },
    };
    const publishedAt = new Date(now.getTime() + 60_000 - index * 1000);
    if (journey.status === 'published') {
      await db.collection('journey_revisions').insertOne({ _id: journey.revisionId, journeyId: journey.id, sequence: 1, schemaVersion: 1, reason: 'published', document, metadataSnapshot: meta, createdAt: now });
      await db.collection('journeys').insertOne({ _id: journey.id, schemaVersion: 1, ...meta, status: 'published', draftDocument: document, editVersion: 1, publishedRevisionId: journey.revisionId, firstPublishedAt: publishedAt, publishedAt, createdAt: now, updatedAt: now });
    } else {
      await db.collection('journeys').insertOne({ _id: journey.id, schemaVersion: 1, ...meta, status: 'draft', draftDocument: document, editVersion: 1, createdAt: now, updatedAt: now });
    }
  }
  await client.close();
});

test.afterAll(async () => {
  const client = await MongoClient.connect(mongoUri);
  const db = client.db();
  await db.collection('journeys').deleteMany({ _id: { $in: journeys.map(({ id }) => id) } });
  await db.collection('journey_revisions').deleteMany({ _id: { $in: journeys.map(({ revisionId }) => revisionId) } });
  await db.collection<{ _id: string }>('media_assets').deleteOne({ _id: mediaId });
  if (originalTravel) await db.collection<{ _id: string }>('travel').replaceOne({ _id: 'travel' }, originalTravel);
  else await db.collection<{ _id: string }>('travel').deleteOne({ _id: 'travel' });
  await client.close();
});

test('visited countries link to the published journeys that went there', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/travel');
  const list = page.getByRole('list', { name: 'Visited places' });
  const japan = list.getByRole('listitem').filter({ hasText: 'Japan' });
  const links = japan.getByRole('link');
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveText(journeys[0].title);
  await expect(links.nth(0)).toHaveAttribute('href', `/stories/${journeys[0].slug}`);
  await expect(links.nth(1)).toHaveText(journeys[1].title);
  await expect(japan.getByText(journeys[2].title)).toHaveCount(0);
  await expect(list.getByRole('listitem').filter({ hasText: 'France' }).getByRole('link')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Countries', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip map', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(links.nth(0)).toBeFocused();

  await page.getByRole('tab', { name: 'US states' }).click();
  await expect(list.getByRole('link')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/travel');
  await expect(page.getByRole('list', { name: 'Visited places' }).getByRole('link')).toHaveCount(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await test.info().attach('e2e-fixture-travel-links-mobile.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  const resultPath = test.info().outputPath('e2e-fixture-travel-links-result.json');
  await writeFile(resultPath, JSON.stringify({ runId, slugs: journeys.map(({ slug }) => slug), overflow }, null, 2));
  await test.info().attach('e2e-fixture-travel-links-result.json', { path: resultPath, contentType: 'application/json' });
  expect(errors).toEqual([]);
});
