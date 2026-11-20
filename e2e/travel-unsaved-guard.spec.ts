import { MongoClient } from 'mongodb';
import { expect, test } from '@playwright/test';
import type { TravelRecord } from '../lib/travel/schema';

const mongoUri = process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e';

test('Travel warns before discarding selections and stays clean after saving', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const uri = new URL(mongoUri);
  if (!['127.0.0.1', 'localhost'].includes(uri.hostname) || uri.port !== '27018' || !uri.pathname.endsWith('_e2e')) {
    throw new Error('Travel E2E requires disposable local Mongo on port 27018 with an *_e2e database.');
  }
  const mongo = new MongoClient(mongoUri);
  const collection = mongo.db().collection<TravelRecord>('travel');
  const original = await collection.findOne({ _id: 'travel' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('503 (Service Unavailable)')) errors.push(message.text());
  });
  const dialogs: string[] = [];
  let accept = false;
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.type());
    if (accept) await dialog.accept();
    else await dialog.dismiss();
  });
  const screenshot = async (name: string) => {
    const path = process.env.TRAVEL_EVIDENCE_PREFIX ? `${process.env.TRAVEL_EVIDENCE_PREFIX}-${name}.png` : testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path, fullPage: true, style: 'nextjs-portal { display: none !important; }' });
    await testInfo.attach(`e2e-fixture-${name}.png`, { path, contentType: 'image/png' });
  };
  try {
    await collection.deleteOne({ _id: 'travel' });
    await page.goto('/admin/travel');
    await expect(page.getByRole('button', { name: 'Save travel' })).toBeDisabled();
    await page.getByRole('link', { name: 'Analytics', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/analytics$/);
    expect(dialogs).toEqual([]);
    await page.goto('/admin/travel');
    const places = [['Countries', 'Japan'], ['US states', 'California'], ['Japan prefectures', 'Tokyo']];
    for (const [tab, place] of places) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await page.getByRole('searchbox', { name: 'Search places' }).fill(place);
      await page.getByRole('checkbox', { name: place, exact: true }).check();
    }
    await page.getByRole('link', { name: 'Analytics', exact: true }).click();
    if (dialogs.length === 0) {
      await expect(page).toHaveURL(/\/admin\/analytics$/);
      await page.goto('/admin/travel');
      await page.getByRole('searchbox', { name: 'Search places' }).fill('Japan');
      await screenshot('lost-selection');
    }
    expect(dialogs).toEqual(['confirm']);
    await expect(page).toHaveURL(/\/admin\/travel$/);
    for (const [tab, place] of places) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await page.getByRole('searchbox', { name: 'Search places' }).fill(place);
      await expect(page.getByRole('checkbox', { name: place, exact: true })).toBeChecked();
    }
    await screenshot('cancel-retained');
    const unload = page.waitForEvent('dialog');
    await page.evaluate(() => { setTimeout(() => window.location.reload(), 0); });
    await unload;
    expect(dialogs).toEqual(['confirm', 'beforeunload']);
    await expect(page.getByRole('checkbox', { name: 'Tokyo', exact: true })).toBeChecked();
    accept = true;
    await page.getByRole('link', { name: 'Analytics', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/analytics$/);
    expect(dialogs).toEqual(['confirm', 'beforeunload', 'confirm']);
    accept = false;
    await page.goto('/admin/travel');
    await page.getByRole('searchbox', { name: 'Search places' }).fill('Japan');
    const japan = page.getByRole('checkbox', { name: 'Japan', exact: true });
    await expect(japan).not.toBeChecked();
    await japan.check();
    await japan.uncheck();
    await page.getByRole('link', { name: 'Analytics', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/analytics$/);
    expect(dialogs).toHaveLength(3);
    await page.goto('/admin/travel');
    await page.getByRole('searchbox', { name: 'Search places' }).fill('Japan');
    await japan.check();
    await page.route('**/api/admin/travel', (route) => route.request().method() === 'PUT'
      ? route.fulfill({ status: 503, json: { error: { message: 'Fixture save unavailable' } } }) : route.continue());
    await page.getByRole('button', { name: 'Save travel' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Fixture save unavailable' })).toBeVisible();
    await page.getByRole('link', { name: 'Analytics', exact: true }).click();
    await expect(japan).toBeChecked();
    expect(dialogs).toHaveLength(4);
    await page.unrouteAll({ behavior: 'wait' });
    await page.getByRole('button', { name: 'Save travel' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Travel saved' })).toBeVisible();
    await page.reload();
    await expect(japan).toBeChecked();
    await page.getByRole('link', { name: 'Analytics', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/analytics$/);
    expect(dialogs).toHaveLength(4);
    expect(errors).toEqual([]);
    await testInfo.attach('e2e-fixture-travel-guard.json', { body: JSON.stringify({ dialogs, errors }), contentType: 'application/json' });
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
    if (original) await collection.replaceOne({ _id: 'travel' }, original, { upsert: true });
    else await collection.deleteOne({ _id: 'travel' });
    await mongo.close();
  }
});
