import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const sections = [
  { path: '/photos', name: 'Photos', title: 'Photos | Yuji' },
  { path: '/travel', name: 'Travel', title: 'Travel | Yuji' },
  { path: '/glass', name: 'Glass', title: 'Glass | Yuji' },
] as const;

test('public pages mark the current section, label the external link and end with a footer', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const observations: Array<Record<string, unknown>> = [];

  for (const section of sections) {
    await page.goto(section.path);
    await expect(page).toHaveTitle(section.title);
    const nav = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(nav.getByRole('link', { name: section.name, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);

    const work = nav.getByRole('link', { name: /Work/ });
    await expect(work).toHaveAccessibleName(/LinkedIn.*new tab/);
    await expect(work).toHaveAttribute('target', '_blank');
    await expect(work).toHaveAttribute('rel', /noopener/);
    await expect(work).toContainText('↗');

    const footer = page.getByRole('navigation', { name: 'Footer navigation' });
    await expect(footer).toBeVisible();
    for (const other of sections) await expect(footer.getByRole('link', { name: other.name, exact: true })).toHaveAttribute('href', other.path);
    observations.push({ path: section.path, title: await page.title() });
  }

  await page.goto('/');
  await expect(page).toHaveTitle('Yuji - Heal the person to your right');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).locator('[aria-current="page"]')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Footer navigation' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/photos', '/travel', '/glass']) {
    await page.goto(path);
    await page.getByRole('navigation', { name: 'Footer navigation' }).scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    observations.push({ path, width: 390, overflow });
    expect(overflow, `${path} overflow`).toBeLessThanOrEqual(0);
  }
  await test.info().attach('e2e-fixture-site-navigation-footer-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
  const resultPath = test.info().outputPath('e2e-fixture-site-navigation-result.json');
  await writeFile(resultPath, JSON.stringify(observations, null, 2));
  await test.info().attach('e2e-fixture-site-navigation-result.json', { path: resultPath, contentType: 'application/json' });
  expect(errors).toEqual([]);
});
