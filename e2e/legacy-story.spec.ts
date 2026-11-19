import { expect, test, type Page } from '@playwright/test';

const legacyStories = [
  { slug: 'poc', heading: 'Autumn in Tōhoku' },
  { slug: 'newpoc', heading: 'Whisy with an e' },
  { slug: 'dfw-okc', heading: 'Oklahoma! Oklahoma?' },
] as const;

function isExpectedCloudinaryFailure(url: string | undefined): boolean {
  return Boolean(url && new URL(url).hostname === 'res.cloudinary.com');
}

function collectRuntimeProblems(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (isExpectedCloudinaryFailure(message.location().url)) return;
    problems.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() < 400 || isExpectedCloudinaryFailure(response.url())) return;
    problems.push(`response ${response.status()}: ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    if (isExpectedCloudinaryFailure(request.url())) return;
    problems.push(`requestfailed: ${request.url()}`);
  });
  return problems;
}

test('legacy MDX stories render on the server without React runtime errors', async ({ page }) => {
  test.setTimeout(90_000);
  const observations: Array<{ slug: string; serverRenderedSteps: number; problems: string[] }> = [];

  for (const story of legacyStories) {
    const html = await (await page.request.get(`/stories/${story.slug}`)).text();
    expect(html).toContain(story.heading);
    const serverRenderedSteps = (html.match(/<section/g) ?? []).length;
    expect(serverRenderedSteps).toBeGreaterThan(0);

    const problems = collectRuntimeProblems(page);
    const response = await page.goto(`/stories/${story.slug}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: story.heading })).toBeVisible();
    await expect(page.locator('section').first()).toBeVisible();
    await page.mouse.wheel(0, 1200);
    await page.waitForLoadState('networkidle');
    page.removeAllListeners('pageerror');
    page.removeAllListeners('console');
    page.removeAllListeners('response');
    page.removeAllListeners('requestfailed');

    observations.push({ slug: story.slug, serverRenderedSteps, problems });
    expect(problems, `${story.slug} runtime problems`).toEqual([]);
  }

  const resultPath = test.info().outputPath('e2e-fixture-legacy-story-result.json');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(resultPath, JSON.stringify(observations, null, 2));
  await test.info().attach('e2e-fixture-legacy-story-result.json', { path: resultPath, contentType: 'application/json' });
});

test('legacy story content differs per slug and unknown slugs return 404', async ({ page }) => {
  await page.goto('/stories/poc');
  await expect(page.getByRole('heading', { level: 1, name: 'Autumn in Tōhoku' })).toBeVisible();
  await page.goto('/stories/newpoc');
  await expect(page.getByRole('heading', { level: 1, name: 'Whisy with an e' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Autumn in Tōhoku' })).toHaveCount(0);

  const missing = await page.request.get(`/stories/not-a-legacy-story-${Date.now()}`);
  expect(missing.status()).toBe(404);
});

test('legacy story fits a 390 px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/stories/poc');
  await expect(page.getByRole('heading', { level: 1, name: 'Autumn in Tōhoku' })).toBeVisible();
  // Story switches to its mobile layout in an effect after hydration.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(0);
  const screenshot = test.info().outputPath('e2e-fixture-legacy-story-mobile.png');
  await page.screenshot({ path: screenshot, fullPage: false });
  await test.info().attach('e2e-fixture-legacy-story-mobile.png', { path: screenshot, contentType: 'image/png' });
});
