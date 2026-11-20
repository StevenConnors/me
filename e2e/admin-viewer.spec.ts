import { MongoClient, type Document } from 'mongodb';
import { expect, test } from '@playwright/test';

const mongoUri = process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e';
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3001';

const readEndpoints = ['/api/admin/journeys', '/api/admin/media', '/api/admin/travel', '/api/admin/collections'];
const writeAttempts: Array<{ method: 'post' | 'put' | 'patch' | 'delete'; path: string; data?: unknown }> = [
  { method: 'post', path: '/api/admin/journeys', data: { title: 'Viewer must not create this' } },
  { method: 'put', path: '/api/admin/travel', data: { selections: { countries: ['JP'], usStates: [], japanPrefectures: [] }, expectedVersion: 0 } },
  { method: 'post', path: '/api/admin/collections', data: { name: 'Viewer collection' } },
  { method: 'post', path: '/api/admin/media/upload-authorizations', data: {} },
  { method: 'post', path: '/api/admin/media/bulk-delete', data: { mediaIds: [] } },
  { method: 'post', path: '/api/admin/photos-page/publish', data: {} },
  { method: 'post', path: '/api/admin/photos-page/discard', data: {} },
  { method: 'patch', path: '/api/admin/photos-page/draft', data: {} },
  { method: 'patch', path: '/api/admin/journeys/000000000000000000000000', data: {} },
  { method: 'delete', path: '/api/admin/journeys/000000000000000000000000' },
  { method: 'delete', path: '/api/admin/media/000000000000000000000000' },
];

async function counts(mongo: MongoClient) {
  const db = mongo.db();
  const travel = await db.collection<Document>('travel').findOne({ _id: 'travel' as never });
  return {
    journeys: await db.collection('journeys').countDocuments(),
    collections: await db.collection('media_collections').countDocuments(),
    travelVersion: travel?.version ?? null,
  };
}

test.describe('read-only admin viewer', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: 'e2e-admin-role', value: 'viewer', url: baseURL }]);
  });

  test('viewer can read admin pages and APIs but every write is forbidden', async ({ page, request }, testInfo) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });

    const mongo = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10_000 });
    await mongo.connect();
    try {
      const before = await counts(mongo);

      await page.goto('/admin/analytics');
      await expect(page).toHaveURL(/\/admin\/analytics$/);
      await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
      await expect(page.getByText('View only', { exact: true })).toBeVisible();
      await page.goto('/admin/journeys');
      await expect(page).toHaveURL(/\/admin\/journeys$/);
      await expect(page.getByText('View only', { exact: true })).toBeVisible();

      const headers = { Cookie: 'e2e-admin-role=viewer' };
      const reads: Record<string, number> = {};
      for (const path of readEndpoints) {
        const response = await request.get(path, { headers });
        reads[path] = response.status();
        expect(response.status(), path).toBe(200);
      }

      const writes: Record<string, number> = {};
      for (const attempt of writeAttempts) {
        const response = await request[attempt.method](attempt.path, { headers, data: attempt.data });
        writes[`${attempt.method.toUpperCase()} ${attempt.path}`] = response.status();
        expect(response.status(), `${attempt.method} ${attempt.path}`).toBe(403);
        expect((await response.json()).error.code).toBe('READ_ONLY_ADMIN');
      }

      expect(await counts(mongo)).toEqual(before);
      expect(problems).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath('e2e-fixture-admin-viewer.png'), fullPage: true });
      await testInfo.attach('e2e-fixture-admin-viewer.png', { path: testInfo.outputPath('e2e-fixture-admin-viewer.png'), contentType: 'image/png' });
      await testInfo.attach('e2e-fixture-admin-viewer.json', { body: JSON.stringify({ reads, writes }, null, 2), contentType: 'application/json' });
    } finally {
      await mongo.close();
    }
  });
});

test('author session without the viewer override keeps write access and no view-only badge', async ({ page, request }) => {
  await page.goto('/admin/analytics');
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await expect(page.getByText('View only', { exact: true })).toHaveCount(0);
  const response = await request.patch('/api/admin/photos-page/draft', { data: {} });
  expect(response.status()).not.toBe(403);
});
