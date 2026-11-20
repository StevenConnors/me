import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

const mongoUri = process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e';
const runId = new ObjectId().toHexString();
const mediaId = new ObjectId().toHexString();
const journeys = [
  { id: new ObjectId(), revisionId: new ObjectId(), slug: `home-index-meta-${runId}`, title: `Autumn index ${runId.slice(-6)}`,
    experiencedAt: { start: '2024-10-02', end: '2024-11-12' }, locations: [{ id: 'jp', label: 'Japan', countryCode: 'JP' }] },
  { id: new ObjectId(), revisionId: new ObjectId(), slug: `home-index-plain-${runId}`, title: `Plain index ${runId.slice(-6)}`, locations: [] },
];

test.beforeAll(async () => {
  const client = await MongoClient.connect(mongoUri);
  const db = client.db();
  const now = new Date();
  await db.collection<{ _id: string } & Record<string, unknown>>('media_assets').insertOne({
    _id: mediaId, schemaVersion: 1, provider: 'cloudinary', providerAssetId: `e2e-${mediaId}`,
    providerPublicId: `e2e/${mediaId}`, resourceType: 'image', deliveryType: 'upload', version: 1,
    originalFilename: `home-index-${runId}.jpg`, format: 'jpg', width: 1200, height: 800, bytes: 100,
    checksum: `e2e-${mediaId}`, tags: [], altText: 'Red maple leaves over a river', status: 'ready', createdAt: now, updatedAt: now,
  });
  const document = {
    schemaVersion: 2, template: 'held-places-v1',
    chapters: [{ id: 'one', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fixture.' }] }] }, media: [] }],
  };
  for (let index = journeys.length - 1; index >= 0; index -= 1) {
    const journey = journeys[index];
    const meta = {
      slug: journey.slug, title: journey.title, summary: `${journey.title} summary.`, locations: journey.locations,
      cover: { mediaAssetId: mediaId, role: 'cover', layout: { desktop: 'full', mobile: 'full' }, decorative: false },
      ...(journey.experiencedAt ? { experiencedAt: journey.experiencedAt } : {}),
    };
    const publishedAt = new Date(now.getTime() + 60_000 - index * 1000);
    await db.collection('journey_revisions').insertOne({ _id: journey.revisionId, journeyId: journey.id, sequence: 1, schemaVersion: 1, reason: 'published', document, metadataSnapshot: meta, createdAt: now });
    await db.collection('journeys').insertOne({ _id: journey.id, schemaVersion: 1, ...meta, status: 'published', draftDocument: document, editVersion: 1, publishedRevisionId: journey.revisionId, firstPublishedAt: publishedAt, publishedAt, createdAt: now, updatedAt: now });
  }
  await client.close();
});

test.afterAll(async () => {
  const client = await MongoClient.connect(mongoUri);
  const db = client.db();
  await db.collection('journeys').deleteMany({ _id: { $in: journeys.map(({ id }) => id) } });
  await db.collection('journey_revisions').deleteMany({ _id: { $in: journeys.map(({ revisionId }) => revisionId) } });
  await db.collection<{ _id: string }>('media_assets').deleteOne({ _id: mediaId });
  await client.close();
});

test('home introduces the site and lists journeys with cover, places and dates', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const intro = page.locator('[data-home-intro]');
  await expect(intro).toBeVisible();
  const introBox = await intro.boundingBox();
  const photosBox = await page.getByRole('heading', { name: 'Photos', level: 1 }).boundingBox();
  expect(introBox!.y).toBeLessThan(photosBox!.y);
  const firstPhoto = await page.locator('[data-home-photo]').count()
    ? await page.locator('[data-home-photo]').first().boundingBox()
    : null;
  if (firstPhoto) expect(firstPhoto.y).toBeLessThan(800);

  const rich = page.getByRole('link', { name: new RegExp(journeys[0].title) });
  await expect(rich.getByRole('img', { name: 'Red maple leaves over a river' })).toBeVisible();
  await expect(rich.locator('[data-journey-meta]')).toHaveText('Japan / October 2024 — November 2024');
  await expect(rich).toContainText(`${journeys[0].title} summary.`);

  const plain = page.getByRole('link', { name: new RegExp(journeys[1].title) });
  await expect(plain.getByRole('img')).toBeVisible();
  await expect(plain.locator('[data-journey-meta]')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const mobileRow = page.getByRole('link', { name: new RegExp(journeys[0].title) });
  await mobileRow.scrollIntoViewIfNeeded();
  await expect(mobileRow.getByRole('img')).toBeVisible();
  await expect(mobileRow.locator('[data-journey-meta]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await test.info().attach('e2e-fixture-home-index-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
  const resultPath = test.info().outputPath('e2e-fixture-home-index-result.json');
  await writeFile(resultPath, JSON.stringify({ runId, introBox, photosBox, firstPhoto, overflow }, null, 2));
  await test.info().attach('e2e-fixture-home-index-result.json', { path: resultPath, contentType: 'application/json' });
  expect(errors).toEqual([]);
});

test('home keeps legacy journeys after published journeys on desktop and mobile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const expectedSlugs = [...journeys.map(({ slug }) => slug), 'poc', 'dfw-okc', 'newpoc'];
  if (process.env.HOME_ARCHIVE_EVIDENCE) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.goto('/');
      await page.locator('#journeys').screenshot({
        path: `${process.env.HOME_ARCHIVE_EVIDENCE}-${width}.png`,
        style: 'nextjs-portal { display: none !important; }',
      });
    }
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto('/');
    const archive = page.locator('#journeys');
    const rows = archive.getByRole('link');
    await expect(rows).toHaveCount(expectedSlugs.length);
    expect(await rows.evaluateAll((links) => links.map((link) => link.getAttribute('href'))))
      .toEqual(expectedSlugs.map((slug) => `/stories/${slug}`));
    await expect(archive.locator('h2 + span')).toHaveText('05');
    for (const slug of ['poc', 'dfw-okc', 'newpoc']) {
      await expect(archive.locator(`a[href="/stories/${slug}"]`)).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await test.info().attach(`e2e-fixture-home-archive-${width}.png`, {
      body: await archive.screenshot({ style: 'nextjs-portal { display: none !important; }' }), contentType: 'image/png',
    });
  }
  expect(errors).toEqual([]);
  await test.info().attach('e2e-fixture-home-archive.json', {
    body: Buffer.from(JSON.stringify({ expectedSlugs, errors })), contentType: 'application/json',
  });
});

test('a published legacy slug appears once with database metadata', async ({ page }) => {
  const client = await MongoClient.connect(mongoUri);
  const db = client.db();
  const journey = journeys[0];
  try {
    await db.collection('journeys').updateOne({ _id: journey.id }, { $set: { slug: 'poc' } });
    await db.collection('journey_revisions').updateOne({ _id: journey.revisionId }, { $set: { 'metadataSnapshot.slug': 'poc' } });
    await page.goto('/');
    const archive = page.locator('#journeys');
    const row = archive.locator('a[href="/stories/poc"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(journey.title);
    await expect(row).toContainText(`${journey.title} summary.`);
    await expect(archive.getByRole('link')).toHaveCount(4);
    await expect(archive.locator('h2 + span')).toHaveText('04');
  } finally {
    await db.collection('journeys').updateOne({ _id: journey.id }, { $set: { slug: journey.slug } });
    await db.collection('journey_revisions').updateOne({ _id: journey.revisionId }, { $set: { 'metadataSnapshot.slug': journey.slug } });
    await client.close();
  }
});

test('a retired legacy slug redirects without duplicating the published journey', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const client = await MongoClient.connect(mongoUri);
  const db = client.db();
  const journey = journeys[0];
  const oldRevisionId = new ObjectId();
  try {
    const revision = await db.collection('journey_revisions').findOne({ _id: journey.revisionId });
    if (!revision) throw new Error('Published fixture revision is missing');
    await db.collection('journey_revisions').updateOne({ _id: journey.revisionId }, { $set: { sequence: 2 } });
    await db.collection('journey_revisions').insertOne({
      ...revision, _id: oldRevisionId, sequence: 1,
      metadataSnapshot: { ...revision.metadataSnapshot, slug: 'poc' },
    });
    await db.collection('journeys').updateOne({ _id: journey.id }, { $set: { publishedSlug: journey.slug } });
    const redirect = await page.request.get('/stories/poc', { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    expect(redirect.headers().location).toBe(`/stories/${journey.slug}`);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.goto('/');
      const archive = page.locator('#journeys');
      await expect(archive.locator('a[href="/stories/poc"]')).toHaveCount(0);
      await expect(archive.locator(`a[href="/stories/${journey.slug}"]`)).toHaveCount(1);
      await expect(archive.getByRole('link')).toHaveCount(4);
      await expect(archive.locator('h2 + span')).toHaveText('04');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    }
    await test.info().attach('e2e-fixture-home-retired-slug.json', {
      body: Buffer.from(JSON.stringify({ oldSlug: 'poc', liveSlug: journey.slug, redirect: redirect.status(), errors })),
      contentType: 'application/json',
    });
    expect(errors).toEqual([]);
  } finally {
    await db.collection('journey_revisions').deleteOne({ _id: oldRevisionId });
    await db.collection('journey_revisions').updateOne({ _id: journey.revisionId }, { $set: { sequence: 1 } });
    await db.collection('journeys').updateOne({ _id: journey.id }, { $unset: { publishedSlug: '' } });
    await client.close();
  }
});
