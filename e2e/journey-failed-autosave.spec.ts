import { expect, test } from '@playwright/test';

test('failed autosave warns before tab navigation and retains the draft for retry', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('500 (Internal Server Error)') && !message.text().includes('Fixture save unavailable')) errors.push(message.text());
  });
  let id: string | undefined;
  try {
    await page.goto('/admin/journeys');
    await page.getByRole('button', { name: 'New journey' }).click();
    await expect(page).toHaveURL(/\/journeys\/[a-f0-9]{24}\/edit$/);
    const editorUrl = page.url();
    id = editorUrl.match(/journeys\/([a-f0-9]{24})/)?.[1];
    await page.route(`**/api/admin/journeys/${id}`, (route) => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, json: { error: { message: 'Fixture save unavailable' } } })
      : route.continue());
    await page.getByLabel('Title', { exact: true }).fill('Retained after save failure');
    await expect(page.getByText('Save failed; try again', { exact: true })).toBeVisible();
    await test.info().attach('e2e-fixture-failed-save.png', { body: await page.screenshot({ path: process.env.JOURNEY_EVIDENCE_PREFIX ? `${process.env.JOURNEY_EVIDENCE_PREFIX}-failed.png` : test.info().outputPath('failed.png'), fullPage: true }), contentType: 'image/png' });
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => { dialogs.push(dialog.type()); await dialog.dismiss(); });
    await page.getByRole('link', { name: 'Analytics', exact: true }).click();
    if (dialogs.length === 0) {
      await expect(page).toHaveURL(/\/admin\/analytics$/);
      await page.goto(editorUrl);
    }
    await test.info().attach('e2e-fixture-navigation.png', { body: await page.screenshot({ path: process.env.JOURNEY_EVIDENCE_PREFIX ? `${process.env.JOURNEY_EVIDENCE_PREFIX}-navigation.png` : test.info().outputPath('navigation.png'), fullPage: true }), contentType: 'image/png' });
    await expect(page).toHaveURL(editorUrl);
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Retained after save failure');
    expect(dialogs).toEqual(['confirm']);
    const unloadDialog = page.waitForEvent('dialog');
    await page.evaluate(() => { setTimeout(() => window.location.reload(), 0); });
    await unloadDialog;
    expect(dialogs).toEqual(['confirm', 'beforeunload']);
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Retained after save failure');
    await page.unrouteAll({ behavior: 'wait' });
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Analytics', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/analytics$/);
    expect(dialogs).toHaveLength(2);
    await page.goto(editorUrl);
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Retained after save failure');
    expect(errors).toEqual([]);
    await test.info().attach('e2e-fixture-retained-draft.json', { body: JSON.stringify({ dialogs, errors, retainedTitle: 'Retained after save failure' }), contentType: 'application/json' });
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
    if (id) await page.request.delete(`/api/admin/journeys/${id}`);
  }
});

test('queued and in-flight edits warn, and explicit discard permits navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let id: string | undefined;
  let release = () => {};
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  try {
    await page.goto('/admin/journeys');
    await page.getByRole('button', { name: 'New journey' }).click();
    await expect(page).toHaveURL(/\/journeys\/[a-f0-9]{24}\/edit$/);
    const editorUrl = page.url();
    id = editorUrl.match(/journeys\/([a-f0-9]{24})/)?.[1];
    await page.route(`**/api/admin/journeys/${id}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      await delayed;
      return route.continue();
    });
    await page.clock.install();
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    await page.getByLabel('Title', { exact: true }).fill('Queued local title');
    await expect(page.getByText('Local changes · not saved', { exact: true })).toBeVisible();
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => { dialogs.push(dialog.type()); await dialog.dismiss(); });
    await page.getByRole('link', { name: 'Photos', exact: true }).click();
    expect(dialogs).toEqual(['confirm']);
    await expect(page).toHaveURL(editorUrl);
    await page.clock.fastForward(1_100);
    await expect(page.getByText('Saving…', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Photos', exact: true }).click();
    expect(dialogs).toEqual(['confirm', 'confirm']);
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Queued local title');
    release();
    await page.clock.resume();
    await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    await page.getByLabel('Title', { exact: true }).fill('Discard this title');
    page.removeAllListeners('dialog');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: 'Analytics', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/analytics$/);
    await page.clock.resume();
    await page.goto(editorUrl);
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Queued local title');
    expect(errors).toEqual([]);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
    if (id) await page.request.delete(`/api/admin/journeys/${id}`);
  }
});
