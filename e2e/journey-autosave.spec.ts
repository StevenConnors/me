import { expect, test } from '@playwright/test';

test('delayed autosave preserves newer typing and saves with the acknowledged version', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  let expectingConflict = false;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !(expectingConflict && message.text().includes('409 (Conflict)'))) errors.push(message.text());
  });
  let journeyId: string | undefined;
  let release = () => {};
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let acknowledge = () => {};
  const received = new Promise<void>((resolve) => { acknowledge = resolve; });
  const requests: { expectedEditVersion: number; title: string }[] = [];
  let savedVersion = -1;
  try {
    await page.goto('/admin/journeys');
    await page.getByRole('button', { name: 'New journey' }).click();
    await expect(page).toHaveURL(/\/journeys\/[a-f0-9]{24}\/edit$/, { timeout: 20_000 });
    journeyId = page.url().match(/journeys\/([a-f0-9]{24})/)?.[1];
    await page.route(`**/api/admin/journeys/${journeyId}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      requests.push(route.request().postDataJSON());
      const response = await route.fetch();
      if (requests.length === 1) {
        savedVersion = (await response.json()).journey.editVersion;
        acknowledge();
        await delayed;
      }
      await route.fulfill({ response });
    });
    await page.clock.install();
    await page.getByLabel('Title', { exact: true }).fill('Autosave A');
    await page.locator('.ProseMirror').fill('Body A');
    await received;
    await page.getByLabel('Title', { exact: true }).fill('Autosave B');
    await page.locator('.ProseMirror').fill('Body B');
    // Advance past the debounce while A remains in flight.
    await page.clock.fastForward(1_100);
    await expect(page.getByText('Saving…', { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('e2e-fixture-autosave-in-flight.png'), fullPage: true });
    release();
    await page.clock.resume();
    await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Autosave B');
    await expect(page.locator('.ProseMirror')).toHaveText('Body B');
    expect(requests).toHaveLength(2);
    expect(requests[1].expectedEditVersion).toBe(savedVersion);
    await page.reload();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Autosave B');
    await expect(page.locator('.ProseMirror')).toHaveText('Body B');
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    expectingConflict = true;
    const competing = await page.request.get(`/api/admin/journeys/${journeyId}`);
    const { journey } = await competing.json();
    const updated = await page.request.patch(`/api/admin/journeys/${journeyId}`, {
      data: { expectedEditVersion: journey.editVersion, title: 'Other session' },
    });
    expect(updated.ok()).toBe(true);
    await page.getByLabel('Title', { exact: true }).fill('Local unsaved text');
    await expect(page.getByText('Another tab changed this journey. Reload before saving again.')).toBeVisible();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Local unsaved text');
    expect(errors).toEqual([]);
    await test.info().attach('e2e-fixture-autosave-observations', {
      body: JSON.stringify({ requests, savedVersion, errors }), contentType: 'application/json',
    });
    await test.info().attach('e2e-fixture-autosave', {
      body: await page.screenshot({ path: test.info().outputPath('e2e-fixture-autosave-result.png'), fullPage: true }), contentType: 'image/png',
    });
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
    if (journeyId) await page.request.delete(`/api/admin/journeys/${journeyId}`);
  }
});
