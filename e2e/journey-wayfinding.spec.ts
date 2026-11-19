import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

const mongoUri = process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e';
const runId = new ObjectId().toHexString().slice(-8);
const paragraph = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const longText = 'We left Dallas before sunrise and drove north along the interstate until the plains opened up around us. '.repeat(12);
const journeys = [
  { slug: `wayfinding-older-${runId}`, title: `Older ${runId}`, chapters: [{ id: 'a1', body: paragraph('Only chapter.'), media: [] }] },
  { slug: `wayfinding-middle-${runId}`, title: `Middle ${runId}`, chapters: [
    { id: 'm1', heading: 'Leaving Dallas', body: paragraph(longText), media: [] },
    { id: 'm2', body: paragraph(`Crossing the Red River at dawn, ${longText}`), media: [] },
    { id: 'm3', body: { type: 'doc', content: [] }, media: [] },
    { id: 'm4', heading: 'Oklahoma City', body: paragraph(longText), media: [] },
  ] },
  { slug: `wayfinding-newer-${runId}`, title: `Newer ${runId}`, chapters: [{ id: 'n1', body: paragraph('Only chapter.'), media: [] }, { id: 'n2', body: paragraph('Second chapter.'), media: [] }] },
].map((journey) => ({ ...journey, id: new ObjectId(), revisionId: new ObjectId() }));

test.beforeAll(async () => {
  const client = await MongoClient.connect(mongoUri);
  const db = client.db();
  const base = Date.now() + 120_000;
  for (let index = 0; index < journeys.length; index += 1) {
    const journey = journeys[index];
    const document = { schemaVersion: 2, template: 'held-places-v1', chapters: journey.chapters };
    const meta = { slug: journey.slug, title: journey.title, summary: `${journey.title} summary.`, locations: [] };
    const publishedAt = new Date(base + index * 1000);
    await db.collection('journey_revisions').insertOne({ _id: journey.revisionId, journeyId: journey.id, sequence: 1, schemaVersion: 1, reason: 'published', document, metadataSnapshot: meta, createdAt: publishedAt });
    await db.collection('journeys').insertOne({ _id: journey.id, schemaVersion: 1, ...meta, status: 'published', draftDocument: document, editVersion: 1, publishedRevisionId: journey.revisionId, firstPublishedAt: publishedAt, publishedAt, createdAt: publishedAt, updatedAt: publishedAt });
  }
  await client.close();
});

test.afterAll(async () => {
  const client = await MongoClient.connect(mongoUri);
  await client.db().collection('journeys').deleteMany({ _id: { $in: journeys.map(({ id }) => id) } });
  await client.db().collection('journey_revisions').deleteMany({ _id: { $in: journeys.map(({ revisionId }) => revisionId) } });
  await client.close();
});

test('journeys list chapters, show reading progress and link to neighbouring journeys', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const [older, middle, newer] = journeys;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/stories/${middle.slug}`);

  const contents = page.getByRole('navigation', { name: 'Chapters' });
  const links = contents.getByRole('link');
  await expect(links).toHaveCount(4);
  await expect(links.nth(0)).toContainText('Leaving Dallas');
  await expect(links.nth(1)).toContainText('Crossing the Red River at dawn');
  expect((await links.nth(1).innerText()).length).toBeLessThan(90);
  await expect(links.nth(2)).toContainText('Chapter 3');
  await expect(links.nth(3)).toContainText('Oklahoma City');

  const progress = page.locator('[data-reading-progress]');
  await expect(progress).toHaveAttribute('aria-hidden', 'true');
  const scaleAt = () => progress.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
  const startScale = await scaleAt();

  await links.nth(3).click();
  await expect(page).toHaveURL(/#chapter-4$/);
  const heading = page.getByRole('heading', { name: 'Oklahoma City', level: 2 });
  await expect(heading).toBeInViewport();
  expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(0);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(scaleAt).toBeGreaterThan(0.95);
  expect(startScale).toBeLessThan(0.1);

  const more = page.getByRole('navigation', { name: 'More journeys' });
  await expect(more.getByRole('link', { name: new RegExp(`Newer journey.*${newer.title}`) })).toHaveAttribute('href', `/stories/${newer.slug}`);
  await expect(more.getByRole('link', { name: new RegExp(`Older journey.*${older.title}`) })).toHaveAttribute('href', `/stories/${older.slug}`);

  await page.goto(`/stories/${older.slug}`);
  await expect(page.getByRole('navigation', { name: 'Chapters' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'More journeys' }).getByRole('link', { name: /Newer journey/ })).toHaveAttribute('href', `/stories/${middle.slug}`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/stories/${middle.slug}`);
  await expect(page.getByRole('navigation', { name: 'Chapters' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('navigation', { name: 'Chapters' }).scrollIntoViewIfNeeded();
  await test.info().attach('e2e-fixture-journey-wayfinding-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
  const resultPath = test.info().outputPath('e2e-fixture-journey-wayfinding-result.json');
  await writeFile(resultPath, JSON.stringify({ runId, startScale, overflow, slugs: journeys.map(({ slug }) => slug) }, null, 2));
  await test.info().attach('e2e-fixture-journey-wayfinding-result.json', { path: resultPath, contentType: 'application/json' });
  expect(errors).toEqual([]);
});
