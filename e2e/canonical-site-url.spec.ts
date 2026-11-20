import { expect, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

import { resolveSiteUrl } from '../lib/site-url';

test('published journal canonical uses the configured public origin', async ({ page }) => {
  const client = await MongoClient.connect(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  const db = client.db();
  const id = new ObjectId();
  const revisionId = new ObjectId();
  const slug = `e2e-canonical-${id.toHexString()}`;
  const now = new Date();
  const metadata = { slug, title: 'Canonical fixture', locations: [] };
  const document = { schemaVersion: 1, editor: 'tiptap', content: { type: 'doc', content: [] } };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await db.collection('journey_revisions').insertOne({ _id: revisionId, journeyId: id, sequence: 1, schemaVersion: 1, reason: 'published', document, metadataSnapshot: metadata, createdAt: now });
    await db.collection('journeys').insertOne({ _id: id, schemaVersion: 1, ...metadata, status: 'published', draftDocument: document, editVersion: 1, publishedRevisionId: revisionId, firstPublishedAt: now, publishedAt: now, createdAt: now, updatedAt: now });
    const expectedOrigin = resolveSiteUrl().origin;
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect((await page.goto(`/stories/${slug}`))?.status()).toBe(200);
      await expect(page.getByRole('heading', { name: metadata.title, exact: true })).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${expectedOrigin}/stories/${slug}`);
    }
    expect(errors).toEqual([]);
    await test.info().attach('e2e-fixture-canonical-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
    await test.info().attach('e2e-fixture-canonical.json', { body: JSON.stringify({ slug, expectedOrigin, errors }), contentType: 'application/json' });
  } finally {
    await db.collection('journeys').deleteOne({ _id: id });
    await db.collection('journey_revisions').deleteOne({ _id: revisionId });
    await client.close();
  }
});
