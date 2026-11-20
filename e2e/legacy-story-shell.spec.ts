import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

const PAPER = 'rgb(241, 240, 235)';

test('legacy stories use the paper shell, header and footer', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const observations: Record<string, unknown>[] = [];

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const slug of ['poc', 'newpoc', 'dfw-okc']) {
      await page.goto(`/stories/${slug}`);
      const primary = page.getByRole('navigation', { name: 'Primary navigation' });
      await expect(primary.getByRole('link', { name: 'Photos' })).toBeVisible();
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.getByRole('navigation', { name: 'Footer navigation' })).toBeAttached();
      const shell = await page.evaluate(() => ({
        bodyPadding: getComputedStyle(document.body).padding,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }));
      expect(shell.bodyPadding).toBe('0px');
      expect(shell.bodyBackground).toBe(PAPER);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

      let panelTop: number | null = null;
      if (viewport.width === 1280) {
        const panel = page.locator('[data-legacy-media-panel]');
        await expect(panel).toBeVisible();
        const header = await primary.boundingBox();
        panelTop = (await panel.boundingBox())!.y;
        expect(panelTop).toBeGreaterThanOrEqual(header!.y + header!.height);
      }
      observations.push({ slug, viewport: viewport.width, ...shell, panelTop });
    }
  }

  await test.info().attach('e2e-fixture-legacy-story-shell-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
  const resultPath = test.info().outputPath('e2e-fixture-legacy-story-shell-result.json');
  await writeFile(resultPath, JSON.stringify(observations, null, 2));
  await test.info().attach('e2e-fixture-legacy-story-shell-result.json', { path: resultPath, contentType: 'application/json' });
  expect(errors).toEqual([]);
});
