import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

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
    for (const route of paperRoutes) {
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

test('legacy stories keep the old page padding', async ({ page }) => {
  await page.setViewportSize(viewports[0]);
  await page.goto('/stories/poc');
  const padding = await page.evaluate(() => getComputedStyle(document.body).padding);
  expect(padding).toBe('8px 48px');
});
