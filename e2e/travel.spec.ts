import { MongoClient } from 'mongodb';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

import type { TravelRecord } from '../lib/travel/schema';

const mongoUri = process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e';
const travelSelections = {
  countries: ['JP'],
  usStates: ['US-CA'],
  japanPrefectures: ['JP-13'],
};

function assertDisposableMongoUri(value: string) {
  const parsed = new URL(value);
  const database = parsed.pathname.replace(/^\//, '');
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port !== '27018' || !database.endsWith('_e2e')) {
    throw new Error('Travel E2E requires a local Mongo database on port 27018 with an *_e2e database name.');
  }
}

type TravelDocument = Record<string, unknown> | null;

async function captureScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true, style: 'nextjs-portal { display: none !important; }' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function expectUniqueMapRegions(page: Page, count: number) {
  const regions = page.locator('[data-travel-map] [data-region-code]');
  const unique = await regions.evaluateAll((elements) => new Set(elements.map((element) => element.getAttribute('data-region-code'))).size);
  expect(unique).toBe(count);
  await expect.poll(async () => regions.evaluateAll((elements) => elements.every((element) => {
    const bounds = (element as SVGGraphicsElement).getBBox();
    return bounds.width > 0 && bounds.height > 0;
  })), { timeout: 15_000 }).toBe(true);
}

test('travel editor clears unsaved changes when saved selections are restored', async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  assertDisposableMongoUri(mongoUri);
  const mongo = new MongoClient(mongoUri);
  const collection = mongo.db().collection<TravelRecord>('travel');
  const original = await collection.findOne({ _id: 'travel' });

  try {
    await collection.replaceOne({ _id: 'travel' }, {
      _id: 'travel',
      schemaVersion: 1,
      selections: { ...travelSelections, countries: ['AU', 'JP'] },
      version: 1,
      updatedAt: null,
    }, { upsert: true });

    await page.goto('/admin/travel');
    const status = page.getByRole('status', { name: '', exact: true });
    const save = page.getByRole('button', { name: 'Save travel' });
    const search = page.getByRole('searchbox', { name: 'Search places' });
    await expect(status).toHaveText(/^Select places/);
    await expect(save).toBeDisabled();

    for (const { country, wasVisited } of [{ country: 'Canada', wasVisited: false }, { country: 'Australia', wasVisited: true }]) {
      await search.fill(country);
      const checkbox = page.getByRole('checkbox', { name: country, exact: true });
      await expect(checkbox).toBeChecked({ checked: wasVisited });
      await checkbox.setChecked(!wasVisited);
      await expect(status).toHaveText('Unsaved changes');
      await expect(save).toBeEnabled();
      await checkbox.setChecked(wasVisited);
      await expect(status).toHaveText(/^Select places/);
      await expect(save).toBeDisabled();
    }

    expect(runtimeErrors).toEqual([]);
    await captureScreenshot(page, testInfo, 'e2e-fixture-travel-restored.png');
    await testInfo.attach('e2e-fixture-travel-restored.json', {
      body: JSON.stringify({ status: await status.textContent(), saveDisabled: await save.isDisabled() }),
      contentType: 'application/json',
    });
  } finally {
    if (original) await collection.replaceOne({ _id: 'travel' }, original, { upsert: true });
    else await collection.deleteOne({ _id: 'travel' });
    await mongo.close();
  }
});

test('travel selections persist across maps, mobile views, and public display', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/status of 503/i.test(message.text())) runtimeErrors.push(message.text());
  });
  assertDisposableMongoUri(mongoUri);
  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const collection = mongo.db().collection('travel');
  const original = await collection.findOne({ _id: 'travel' }) as TravelDocument;
  await collection.deleteOne({ _id: 'travel' });

  try {
    // Admin navigation loads with the local author session provided by the E2E server.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/travel');
    await expect(page.getByRole('heading', { name: 'Visited places' })).toBeVisible();
    const tabs = page.getByRole('tablist');
    await expect(tabs.getByRole('tab', { name: 'Countries' })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'US states' })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'Japan prefectures' })).toBeVisible();
    await expectUniqueMapRegions(page, 249);

    // Each editor view supports list keyboard input and reports the same state on its map.
    const search = page.getByRole('searchbox', { name: 'Search places' });
    await search.fill('Japan');
    const japan = page.getByRole('checkbox', { name: 'Japan', exact: true });
    await expect(japan).toBeVisible();
    await japan.focus();
    await page.keyboard.press('Space');
    await expect(japan).toBeChecked();
    await expect(page.locator('[data-region-code="JP"][aria-pressed="true"]')).toHaveCount(1);

    await tabs.getByRole('tab', { name: 'US states' }).click();
    await expectUniqueMapRegions(page, 50);
    await search.fill('California');
    await page.locator('[data-region-code="US-CA"][aria-pressed="false"]').click();
    const california = page.getByRole('checkbox', { name: 'California', exact: true });
    await expect(california).toBeChecked();
    await expect(page.locator('[data-region-code="US-CA"][aria-pressed="true"]')).toHaveCount(1);
    const californiaMapControl = page.locator('[data-region-code="US-CA"][aria-pressed="true"]');
    await californiaMapControl.focus();
    await page.keyboard.press('Enter');
    await expect(california).not.toBeChecked();
    await page.locator('[data-region-code="US-CA"][aria-pressed="false"]').focus();
    await page.keyboard.press('Enter');
    await expect(california).toBeChecked();

    await tabs.getByRole('tab', { name: 'Japan prefectures' }).click();
    await expectUniqueMapRegions(page, 47);
    await search.fill('Kyoto');
    await expect(page.getByRole('checkbox', { name: /Kyōto Prefecture/i })).toBeVisible();
    await search.fill('Tokyo');
    const tokyo = page.getByRole('checkbox', { name: 'Tokyo', exact: true });
    await tokyo.check();
    await expect(page.locator('[data-region-code="JP-13"][aria-pressed="true"]')).toHaveCount(1);

    await page.screenshot({
      path: testInfo.outputPath('e2e-fixture-travel-mobile-admin.png'),
      fullPage: true,
      style: 'nextjs-portal { display: none !important; }',
    });
    await testInfo.attach('e2e-fixture-travel-mobile-admin.png', { path: testInfo.outputPath('e2e-fixture-travel-mobile-admin.png'), contentType: 'image/png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

    // A failed save keeps the complete selection editable and does not show success.
    await page.route('**/api/admin/travel', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'temporary failure' }) });
      } else {
        await route.continue();
      }
    });
    await page.getByRole('button', { name: 'Save travel' }).click();
    await tabs.getByRole('tab', { name: 'Countries' }).click();
    await expect(page.getByRole('checkbox', { name: 'Japan', exact: true })).toBeChecked();
    await tabs.getByRole('tab', { name: 'US states' }).click();
    await expect(page.getByRole('checkbox', { name: 'California', exact: true })).toBeChecked();
    await tabs.getByRole('tab', { name: 'Japan prefectures' }).click();
    await expect(page.getByRole('checkbox', { name: 'Tokyo', exact: true })).toBeChecked();
    await expect(page.getByRole('status').filter({ hasText: 'Travel saved' })).toHaveCount(0);
    await page.unroute('**/api/admin/travel');
    await page.getByRole('button', { name: 'Save travel' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Travel saved' })).toBeVisible();

    const saved = await page.request.get('/api/admin/travel');
    expect(saved.ok()).toBe(true);
    const savedBody = await saved.json() as { selections: typeof travelSelections; version: number };
    expect(savedBody.selections).toEqual(travelSelections);
    expect(await collection.findOne({ _id: 'travel' })).toMatchObject({ selections: travelSelections });

    await page.reload();
    await page.getByRole('tab', { name: 'Japan prefectures' }).click();
    await expect(page.getByRole('checkbox', { name: 'Tokyo', exact: true })).toBeChecked();
    await expect(page.getByRole('tab', { name: 'Japan prefectures' })).toHaveAttribute('aria-selected', 'true');

    // Verify the published map, visible list, and selected count at a phone width.
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Travel', exact: true }).click();
    await expect(page).toHaveURL(/\/travel$/);
    await expect(page.getByRole('heading', { name: 'Travel' })).toBeVisible();
    const publicTabs = page.getByRole('tablist');
    await expect(publicTabs.getByRole('tab', { name: 'Countries' })).toBeVisible();
    await expect(publicTabs.getByRole('tab', { name: 'US states' })).toBeVisible();
    await expect(publicTabs.getByRole('tab', { name: 'Japan prefectures' })).toBeVisible();

    await publicTabs.getByRole('tab', { name: 'Countries' }).click();
    await expectUniqueMapRegions(page, 249);
    await expect(page.getByRole('list', { name: 'Visited places' })).toContainText('Japan');
    await expect(page.locator('[data-travel-map] [data-region-code="JP"]')).toHaveAttribute('data-visited', 'true');
    await expect(page.locator('[data-travel-count]')).toHaveText('1');
    await expect(page.getByRole('list', { name: 'Visited places' }).getByRole('listitem')).toHaveCount(1);
    await captureScreenshot(page, testInfo, 'e2e-fixture-travel-mobile-countries.png');

    await publicTabs.getByRole('tab', { name: 'US states' }).click();
    await expectUniqueMapRegions(page, 50);
    await expect(page.getByRole('list', { name: 'Visited places' })).toContainText('California');
    await expect(page.locator('[data-travel-map] [data-region-code="US-CA"]')).toHaveAttribute('data-visited', 'true');
    await expect(page.locator('[data-travel-count]')).toHaveText('1');
    await expect(page.getByRole('list', { name: 'Visited places' }).getByRole('listitem')).toHaveCount(1);
    await captureScreenshot(page, testInfo, 'e2e-fixture-travel-mobile-us-states.png');

    await publicTabs.getByRole('tab', { name: 'Japan prefectures' }).click();
    await expectUniqueMapRegions(page, 47);
    await expect(page.getByRole('list', { name: 'Visited places' })).toContainText('Tokyo');
    await expect(page.locator('[data-travel-map] [data-region-code="JP-13"]')).toHaveAttribute('data-visited', 'true');
    await expect(page.locator('[data-travel-count]')).toHaveText('1');
    await expect(page.getByRole('list', { name: 'Visited places' }).getByRole('listitem')).toHaveCount(1);
    await captureScreenshot(page, testInfo, 'e2e-fixture-travel-mobile-japan-prefectures.png');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await publicTabs.getByRole('tab', { name: 'Countries' }).click();
    await captureScreenshot(page, testInfo, 'e2e-fixture-travel-desktop.png');
    await page.setViewportSize({ width: 390, height: 844 });

    // Removing each saved region is an explicit empty-state save and must reach the public route.
    await page.goto('/admin/travel');
    for (const [tabName, placeName] of [
      ['Countries', 'Japan'],
      ['US states', 'California'],
      ['Japan prefectures', 'Tokyo'],
    ]) {
      await page.getByRole('tab', { name: tabName }).click();
      const checkbox = page.getByRole('checkbox', { name: placeName, exact: true });
      await checkbox.uncheck();
    }
    await page.getByRole('button', { name: 'Save travel' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Travel saved' })).toBeVisible();
    await page.goto('/travel');
    await expect(page.getByRole('status').filter({ hasText: 'No places visited yet.' })).toBeVisible();
    expect(await collection.findOne({ _id: 'travel' })).toMatchObject({
      selections: { countries: [], usStates: [], japanPrefectures: [] },
    });

    // Bad codes are rejected; stale compare-and-swap versions cannot overwrite the latest save.
    const current = await page.request.get('/api/admin/travel');
    expect(current.ok()).toBe(true);
    const currentBody = await current.json() as { version: number };
    const invalid = await page.request.put('/api/admin/travel', {
      data: { selections: { ...travelSelections, countries: ['NOT-A-COUNTRY'] }, expectedVersion: currentBody.version },
    });
    expect(invalid.status()).toBe(400);
    const latest = await page.request.get('/api/admin/travel');
    const latestBody = await latest.json() as { version: number };
    const stale = await page.request.put('/api/admin/travel', {
      data: { selections: { countries: [], usStates: [], japanPrefectures: [] }, expectedVersion: currentBody.version - 1 },
    });
    expect(stale.status()).toBe(409);
    expect((await (await page.request.get('/api/admin/travel')).json() as { version: number }).version).toBe(latestBody.version);
    expect(runtimeErrors).toEqual([]);

  } finally {
    if (original) await collection.replaceOne({ _id: 'travel' }, original, { upsert: true });
    else await collection.deleteOne({ _id: 'travel' });
    await mongo.close();
  }
});
