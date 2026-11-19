import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

const mongoUri = process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e';
const journeySlug = `paper-shell-${Date.now()}`;
const journeyId = new ObjectId();
const revisionId = new ObjectId();

test.beforeAll(async () => {
  const client = await MongoClient.connect(mongoUri);
  const now = new Date();
  const document = {
    schemaVersion: 2,
    template: 'held-places-v1',
    chapters: [{ id: 'one', heading: 'One', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Paper shell fixture.' }] }] }, media: [] }],
  };
  const meta = { slug: journeySlug, title: 'Paper shell fixture', locations: [] };
  await client.db().collection('journey_revisions').insertOne({ _id: revisionId, journeyId, sequence: 1, schemaVersion: 1, reason: 'published', document, metadataSnapshot: meta, createdAt: now });
  await client.db().collection('journeys').insertOne({ _id: journeyId, schemaVersion: 1, ...meta, status: 'published', draftDocument: document, editVersion: 1, publishedRevisionId: revisionId, firstPublishedAt: now, publishedAt: now, createdAt: now, updatedAt: now });
  await client.close();
});

test.afterAll(async () => {
  const client = await MongoClient.connect(mongoUri);
  await client.db().collection('journeys').deleteOne({ _id: journeyId });
  await client.db().collection('journey_revisions').deleteOne({ _id: revisionId });
  await client.close();
});

const paperRoutes = ['/', '/photos', '/travel', '/glass'] as const;
const viewports = [{ width: 1280, height: 800 }, { width: 390, height: 844 }] as const;
const paperColor = 'rgb(241, 240, 235)';

test('held-places pages meet the viewport edge on paper', async ({ page }) => {
  test.setTimeout(90_000);
  const observations: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of [...paperRoutes, `/stories/${journeySlug}`]) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      const shell = await page.evaluate(() => {
        const main = document.querySelector('body > main');
        const rect = main?.getBoundingClientRect();
        return {
          left: rect?.left,
          top: rect?.top,
          width: rect?.width,
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        };
      });
      observations.push({ route, ...viewport, ...shell });
      expect(shell.left, `${route} @${viewport.width} left`).toBe(0);
      expect(shell.top, `${route} @${viewport.width} top`).toBe(0);
      expect(shell.width, `${route} @${viewport.width} width`).toBe(shell.viewportWidth);
      expect(shell.bodyBackground, `${route} @${viewport.width} body`).toBe(paperColor);
      expect(shell.scrollWidth, `${route} @${viewport.width} overflow`).toBeLessThanOrEqual(shell.viewportWidth);
    }
  }

  await page.setViewportSize(viewports[1]);
  await page.goto('/photos');
  await test.info().attach('e2e-fixture-paper-shell-photos-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
  const resultPath = test.info().outputPath('e2e-fixture-paper-shell-result.json');
  await writeFile(resultPath, JSON.stringify(observations, null, 2));
  await test.info().attach('e2e-fixture-paper-shell-result.json', { path: resultPath, contentType: 'application/json' });
  expect(errors).toEqual([]);
});

test('the admin journey preview keeps the old page padding', async ({ page }) => {
  await page.setViewportSize(viewports[0]);
  await page.goto(`/admin/preview/${journeyId.toHexString()}`);
  await expect(page.locator('main[class*="paper"]').first()).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).padding)).toBe('8px 48px');
});
