import { open, rm, writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

const sampleImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+9+vWAAAAAElFTkSuQmCC', 'base64');
const sampleVideo = Buffer.from('00000018667479706d703432000000006d703432', 'hex');

test('an author imports and uploads videos, builds a mixed journey carousel, and publishes playback', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const title = `Video journey ${suffix}`;
  const slug = `video-journey-${suffix}`;
  let journeyId: string | undefined;
  const mediaIds: string[] = [];

  try {
    await page.goto('/admin/media');
    await expect(page.getByRole('button', { name: 'Import Cloudinary videos' })).toBeVisible();
    await page.getByRole('button', { name: 'Import Cloudinary videos' }).click();
    await expect(page.getByText(/Cloudinary video.*imported/)).toBeVisible();
    await page.getByLabel('Filter by type').selectOption('video');
    await expect(page.getByRole('article', { name: 'existing-video.mp4' })).toBeVisible();
    const imported = await page.request.get('/api/admin/media?resourceType=video&q=existing-video.mp4');
    const importedVideoId = (await imported.json() as { media: Array<{ _id: string }> }).media[0]._id;
    mediaIds.push(importedVideoId);

    const finalizeVideo = page.waitForResponse((response) => response.url().endsWith('/api/admin/media/finalize') && response.request().method() === 'POST');
    await page.locator('input[type=file]').first().setInputFiles({ name: `clip-${suffix}.mp4`, mimeType: 'video/mp4', buffer: sampleVideo });
    const finalizedVideo = await finalizeVideo;
    expect(finalizedVideo.ok()).toBe(true);
    const videoId = (await finalizedVideo.json() as { media: { _id: string } }).media._id;
    mediaIds.push(videoId);
    await expect(page.getByRole('article', { name: 'sample-video.mp4' })).toBeVisible();

    const finalizeImage = page.waitForResponse((response) => response.url().endsWith('/api/admin/media/finalize') && response.request().method() === 'POST');
    await page.locator('input[type=file]').first().setInputFiles({ name: `cover-${suffix}.png`, mimeType: 'image/png', buffer: sampleImage });
    const finalizedImage = await finalizeImage;
    expect(finalizedImage.ok()).toBe(true);
    const coverId = (await finalizedImage.json() as { media: { _id: string } }).media._id;
    mediaIds.push(coverId);

    await page.goto('/admin/journeys');
    await page.getByRole('button', { name: 'New journey' }).click();
    await expect(page).toHaveURL(/\/admin\/journeys\/[a-f0-9]{24}\/edit$/);
    journeyId = page.url().match(/\/journeys\/([a-f0-9]{24})\/edit$/)?.[1];
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Public slug').fill(slug);
    await page.getByLabel('Summary').fill('A journey with moving images.');
    await page.getByLabel('Cover image').selectOption(coverId);
    await page.getByRole('button', { name: 'Choose media' }).click();
    const library = page.getByRole('region', { name: 'Media library' });
    await library.locator(`input[type="checkbox"][value="${importedVideoId}"]`).check();
    await library.locator(`input[type="checkbox"][value="${videoId}"]`).check();
    await library.locator(`input[type="checkbox"][value="${coverId}"]`).check();
    await library.getByRole('button', { name: 'Add selected' }).click();
    await expect(page.getByRole('region', { name: 'Held Places chapter editor' }).getByText('existing-video.mp4')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Held Places chapter editor' }).getByText('sample-video.mp4')).toBeVisible();
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Publish journey' }).click();
    await expect(page.getByText('Published from a new immutable revision.')).toBeVisible();

    await page.goto(`/stories/${slug}`);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Media carousel, 3 items' })).toBeVisible();
    const videos = page.locator('video[controls]');
    await expect(videos).toHaveCount(2);
    await expect(videos.first()).toHaveAttribute('poster', /./);
    await expect(videos.first()).toHaveAttribute('src', /media\.mp4/);
    await expect(videos.last()).toHaveAttribute('poster', /./);
    const screenshotPath = testInfo.outputPath('published-video-journey.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('published-video-journey.png', {
      path: screenshotPath,
      contentType: 'image/png',
    });
    const resultPath = testInfo.outputPath('video-journey-result.json');
    await writeFile(resultPath, JSON.stringify({ imported: true, uploaded: true, published: true, videoControls: true, poster: true }, null, 2));
    await testInfo.attach('video-journey-result.json', { path: resultPath, contentType: 'application/json' });
  } finally {
    if (journeyId) await page.request.delete(`/api/admin/journeys/${journeyId}`);
    for (const id of mediaIds) await page.request.delete(`/api/admin/media/${id}`);
  }
});

test('large videos upload as signed Cloudinary chunks', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const providerAssetId = `e2e-video-chunked-${Date.now()}`;
  const ranges: string[] = [];
  const videoPath = testInfo.outputPath('large-video.mp4');
  let mediaId: string | undefined;
  await page.route('**/api/e2e/media-upload?resourceType=video', async (route) => {
    ranges.push(route.request().headers()['content-range'] ?? '');
    const last = ranges.at(-1)?.endsWith('/104857601') && ranges.at(-1)?.includes('104857600-104857600/');
    await route.fulfill({ json: last ? {
      asset_id: providerAssetId, public_id: `e2e/${providerAssetId}`, resource_type: 'video',
      type: 'upload', version: 1, original_filename: 'large-video.mp4', format: 'mp4',
      width: 640, height: 360, bytes: 104857601, signature: 'e2e-upload-signature',
      tags: `upload-session-${route.request().headers()['x-unique-upload-id']}`,
      done: true,
    } : { done: false } });
  });
  try {
    const file = await open(videoPath, 'w');
    await file.truncate(100 * 1024 * 1024 + 1);
    await file.close();
    await page.goto('/admin/media');
    const finalize = page.waitForResponse((response) => response.url().endsWith('/api/admin/media/finalize') && response.request().method() === 'POST');
    await page.locator('input[type=file]').first().setInputFiles(videoPath);
    const response = await finalize;
    expect(response.ok(), await response.text()).toBe(true);
    mediaId = (await response.json() as { media: { _id: string } }).media._id;
    expect(ranges.length).toBeGreaterThan(1);
    expect(ranges[0]).toMatch(/^bytes 0-\d+\/104857601$/);
    expect(ranges.at(-1)).toBe('bytes 104857600-104857600/104857601');
    await expect(page.getByText('1 file is ready in the media library.')).toBeVisible();
  } finally {
    if (mediaId) await page.request.delete(`/api/admin/media/${mediaId}`);
    await rm(videoPath, { force: true });
  }
});
