import { expect, test } from '@playwright/test';

test('map labels identify hovered and focused places in public and admin views', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/travel');
  await page.setViewportSize({ width: 1100, height: 900 });
  const tooltip = page.getByRole('tooltip');

  for (const [tab, code, name] of [
    ['Countries', 'EG', 'Egypt'],
    ['US states', 'US-CA', 'California'],
    ['Japan prefectures', 'JP-01', 'Hokkaidō'],
  ]) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(tooltip).toHaveCount(0);
    const place = page.locator(`[data-region-code="${code}"]`);
    const visited = await place.getAttribute('data-visited');
    await place.hover();
    await expect(tooltip).toContainText(name);
    const screenshot = testInfo.outputPath(`${code}-hover.png`);
    await page.screenshot({ path: screenshot, fullPage: true, style: 'nextjs-portal {display:none}' });
    await testInfo.attach(`${code}-hover`, { path: screenshot, contentType: 'image/png' });
    await page.mouse.move(0, 0);
    await expect(tooltip).toHaveCount(0);
    await place.focus();
    await expect(tooltip).toContainText(name);
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await expect(place).toHaveAttribute('data-visited', visited!);
  }

  await page.getByRole('tab', { name: 'Countries', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-region-code="MC"] circle').hover();
  await expect(tooltip).toContainText('Monaco');
  const bounds = await tooltip.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  const monaco = page.locator('[data-region-code="MC"]');
  const monacoVisited = await monaco.getAttribute('data-visited');
  await monaco.locator('circle').click();
  await expect(tooltip).toContainText('Monaco');
  await expect(monaco).toHaveAttribute('data-visited', monacoVisited!);
  await page.getByRole('tab', { name: 'US states', exact: true }).click();
  await expect(tooltip).toHaveCount(0);

  await page.goto('/admin/travel');
  await page.getByRole('searchbox', { name: 'Search places' }).waitFor();
  await expect(page.getByRole('searchbox', { name: 'Search places' })).toBeEnabled();
  const egypt = page.locator('[data-region-code="EG"]');
  const selectedBefore = await egypt.getAttribute('aria-pressed');
  await egypt.focus();
  await expect(tooltip).toContainText('Egypt');
  await page.keyboard.press('Enter');
  await expect(egypt).toHaveAttribute('aria-pressed', selectedBefore === 'true' ? 'false' : 'true');
  await page.keyboard.press('Enter');
  await expect(egypt).toHaveAttribute('aria-pressed', selectedBefore!);
  expect(errors).toEqual([]);
});
