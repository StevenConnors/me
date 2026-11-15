import { writeFile } from 'node:fs/promises';

import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

const regions = [
  { tab: 'Countries', code: 'EG', name: 'Egypt', width: 360 },
  { tab: 'US states', code: 'US-CA', name: 'California', width: 1000 },
  { tab: 'Japan prefectures', code: 'JP-01', name: 'Hokkaidō', width: 900 },
];

async function viewBox(map: Locator) {
  return (await map.getAttribute('viewBox'))!.split(/\s+/).map(Number);
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(name);
  await page.screenshot({ path, fullPage: true, style: 'nextjs-portal { display: none !important; }' });
  await info.attach(name, { path, contentType: 'image/png' });
}

test('pointer focus has no bounding rectangle and keyboard focus highlights the shape', async ({ page }, info) => {
  await page.goto('/travel');
  const map = page.locator('[data-travel-map]');
  await map.scrollIntoViewIfNeeded();
  const bounds = (await map.boundingBox())!;
  const russia = page.locator('[data-region-code="RU"]');
  await page.mouse.click(bounds.x + bounds.width * .8, bounds.y + bounds.height * .15);
  await expect(russia).toBeFocused();
  expect(await russia.evaluate((element) => element.matches(':focus-visible'))).toBe(false);
  await expect(russia).toHaveCSS('outline-style', 'none');
  await screenshot(page, info, 'travel-pointer-focus-no-box.png');

  await page.getByRole('tab', { name: 'Countries', exact: true }).focus();
  await page.keyboard.press('Tab');
  await russia.focus();
  await expect(page.getByRole('tooltip')).toHaveText('Russia');
  await expect(russia).toHaveCSS('outline-style', 'none');
  await expect(russia).not.toHaveCSS('filter', 'none');
});

test('all public and admin maps zoom, pan, reset, and preserve place interactions', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const observations: object[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  for (const route of ['/travel', '/admin/travel']) {
    await page.goto(route);
    if (route.startsWith('/admin')) await expect(page.getByRole('searchbox')).toBeEnabled();
    const map = page.locator('[data-travel-map]');
    const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true });
    const zoomOut = page.getByRole('button', { name: 'Zoom out', exact: true });
    const reset = page.getByRole('button', { name: 'Reset map', exact: true });

    for (const region of regions) {
      await page.getByRole('tab', { name: region.tab, exact: true }).click();
      await expect(map).toHaveAttribute('viewBox', new RegExp(`^0 0 ${region.width} `));
      await expect(zoomOut).toBeDisabled();
      await expect(reset).toBeDisabled();
      const before = await viewBox(map);
      await zoomIn.click();
      await expect.poll(async () => (await viewBox(map))[2]).toBeLessThan(before[2]);
      const zoomed = await viewBox(map);
      await expect(reset).toBeEnabled();

      await map.scrollIntoViewIfNeeded();
      const bounds = (await map.boundingBox())!;
      const visitedBefore = await map.locator('[data-region-code]').evaluateAll((places) => places.map((place) => place.getAttribute('data-visited')));
      await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .5);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * .62, bounds.y + bounds.height * .58, { steps: 8 });
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await page.mouse.up();
      await expect.poll(async () => (await viewBox(map))[0]).toBeLessThan(zoomed[0]);
      expect(await map.locator('[data-region-code]').evaluateAll((places) => places.map((place) => place.getAttribute('data-visited')))).toEqual(visitedBefore);

      await map.focus();
      await page.keyboard.press('+');
      await expect.poll(async () => (await viewBox(map))[2]).toBeLessThan(zoomed[2]);
      const beforePan = await viewBox(map);
      await page.keyboard.press('ArrowRight');
      await expect.poll(async () => (await viewBox(map))[0]).toBeGreaterThan(beforePan[0]);
      await page.keyboard.press('Home');
      expect(await viewBox(map)).toEqual(before);
      await expect(zoomOut).toBeDisabled();

      const place = map.locator(`[data-region-code="${region.code}"]`);
      await zoomIn.click();
      await zoomIn.click();
      await place.focus();
      await expect(page.getByRole('tooltip')).toHaveText(region.name);
      const placeBounds = (await place.boundingBox())!;
      const mapBounds = (await map.boundingBox())!;
      expect(placeBounds.x + placeBounds.width).toBeGreaterThan(mapBounds.x);
      expect(placeBounds.x).toBeLessThan(mapBounds.x + mapBounds.width);
      const selected = await place.getAttribute('data-visited');
      if (route.startsWith('/admin')) {
        await page.keyboard.press('Enter');
        await expect(place).toHaveAttribute('data-visited', selected === 'true' ? 'false' : 'true');
        await page.keyboard.press('Enter');
      }
      await expect(place).toHaveAttribute('data-visited', selected!);
      await screenshot(page, info, `travel-${route.startsWith('/admin') ? 'admin' : 'public'}-${region.code}-zoom.png`);
      await reset.click();
      expect(await viewBox(map)).toEqual(before);
      observations.push({ route, region: region.tab, initialViewBox: before, zoomedViewBox: zoomed, panningPreservedSelection: true });
    }

    await page.getByRole('tab', { name: 'Countries', exact: true }).click();
    for (let index = 0; index < 12 && await zoomIn.isEnabled(); index += 1) await zoomIn.click();
    await expect(zoomIn).toBeDisabled();
    expect((await viewBox(map))[2]).toBe(30);
    await map.focus();
    for (let index = 0; index < 50; index += 1) await page.keyboard.press('ArrowLeft');
    expect((await viewBox(map))[0]).toBe(0);
    await page.keyboard.press('Home');
  }

  await page.goto('/travel');
  const map = page.locator('[data-travel-map]');
  await map.scrollIntoViewIfNeeded();
  await map.hover();
  const initial = await viewBox(map);
  const initialScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialScroll);
  expect(await viewBox(map)).toEqual(initial);
  await map.scrollIntoViewIfNeeded();
  await map.hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await viewBox(map))[2]).toBeLessThan(initial[2]);
  await page.getByRole('tab', { name: 'US states', exact: true }).click();
  await page.getByRole('tab', { name: 'Countries', exact: true }).click();
  expect(await viewBox(map)).toEqual(initial);
  expect(errors).toEqual([]);
  const path = info.outputPath('travel-map-zoom-result.json');
  await writeFile(path, JSON.stringify({ observations, errors, wheelZoom: true, tabReset: true }, null, 2));
  await info.attach('travel-map-zoom-result.json', { path, contentType: 'application/json' });
});

test.describe('touch map', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });

  test('pinch and touch drag zoom and pan without mobile overflow', async ({ page }, info) => {
    const inputEvents: object[] = [];
    page.on('console', (message) => {
      if (message.text().startsWith('TRAVEL_TOUCH ')) inputEvents.push(JSON.parse(message.text().slice('TRAVEL_TOUCH '.length)));
    });
    await page.goto('/travel');
    await page.evaluate(() => {
      for (const type of ['pointerdown', 'pointerup', 'click'] as const) document.addEventListener(type, (event) => {
        const point = event as PointerEvent;
        const target = event.target as Element;
        console.log('TRAVEL_TOUCH ' + JSON.stringify({ type, target: target.closest('[aria-label]')?.getAttribute('aria-label'), x: point.clientX, y: point.clientY, scale: window.visualViewport?.scale }));
      }, true);
    });
    const map = page.locator('[data-travel-map]');
    await map.scrollIntoViewIfNeeded();
    const initial = await viewBox(map);
    const bounds = (await map.boundingBox())!;
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 30, y, id: 0 }, { x: x + 30, y, id: 1 }] });
    for (const distance of [40, 50, 60]) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - distance, y, id: 0 }, { x: x + distance, y, id: 1 }] });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await viewBox(map))[2]).toBeLessThan(initial[2]);
    const zoomed = await viewBox(map);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 30, y, id: 0 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await viewBox(map))[0]).toBeLessThan(zoomed[0]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await screenshot(page, info, 'travel-mobile-pinch-zoom.png');
    const reset = page.getByRole('button', { name: 'Reset map', exact: true });
    try {
      const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true });
      const controlBounds = (await zoomIn.boundingBox())!;
      const controlX = controlBounds.x + controlBounds.width / 2;
      const controlY = controlBounds.y + controlBounds.height / 2;
      const beforeCancelledTap = await viewBox(map);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: controlX, y: controlY, id: 0 }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: controlX - 60, y: controlY, id: 0 }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      expect(await viewBox(map)).toEqual(beforeCancelledTap);
      await zoomIn.tap();
      await expect.poll(async () => (await viewBox(map))[2]).toBeCloseTo(zoomed[2] / 1.5);
      await page.getByRole('button', { name: 'Zoom out', exact: true }).tap();
      await expect.poll(async () => (await viewBox(map))[2]).toBeCloseTo(zoomed[2]);
      await reset.tap();
      await expect.poll(() => viewBox(map)).toEqual(initial);
      await expect(reset).toBeDisabled();
    } finally {
      const artifactPath = info.outputPath('travel-touch-input.json');
      await writeFile(artifactPath, JSON.stringify(inputEvents, null, 2));
      await info.attach('travel-touch-input.json', { path: artifactPath, contentType: 'application/json' });
    }
    await screenshot(page, info, 'travel-mobile-reset.png');
  });
});
