import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MongoClient } from 'mongodb';
import { expect, test } from '@playwright/test';

const sampleImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+9+vWAAAAAElFTkSuQmCC',
  'base64',
);

function runWorker(mode: 'export' | 'import', directory: string, mediaId?: string) {
  return spawnSync('node', ['scripts/backfill-media-enrichments.mjs', `--${mode}`, directory, ...(mediaId ? ['--media-id', mediaId] : [])], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, MONGODB_URI: process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e', E2E_TEST_MODE: '1' },
  });
}

test('Codex worker exports pending uploads, imports validated vision output, and feeds suggestions', async ({ page }) => {
  test.setTimeout(90_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  const batch = await mkdtemp(join(tmpdir(), 'media-enrichment-worker-'));
  let retryBatch: string | undefined;
  let connected = false;
  let mediaId: string | undefined;
  const collectionIds: string[] = [];
  try {
    await mongo.connect();
    connected = true;
    await page.goto('/admin/media');
    const finalized = page.waitForResponse((response) => response.url().endsWith('/api/admin/media/finalize') && response.request().method() === 'POST');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'gps-eg-fixture.png', mimeType: 'image/png', buffer: sampleImage });
    const response = await finalized;
    expect(response.ok()).toBe(true);
    const db = mongo.db();
    mediaId = (await response.json() as { media: { _id: string } }).media._id;
    await expect.poll(async () => {
      const record = await db.collection('media_enrichments').findOne({ mediaAssetId: mediaId });
      return record?.status === 'pending' && record.countryCode === 'EG';
    }).toBe(true);

    const countryCollection = await page.request.post('/api/admin/collections', { data: { name: `Worker Egypt ${Date.now()}`, suggestionRule: { kind: 'country', countryCode: 'EG' } } });
    expect(countryCollection.status()).toBe(201);
    const countryCollectionId = (await countryCollection.json() as { collection: { _id: string } }).collection._id;
    collectionIds.push(countryCollectionId);
    const countrySuggestions = await page.request.get(`/api/admin/collections/${countryCollectionId}/suggestions`);
    expect((await countrySuggestions.json() as { suggestions: Array<{ media: { _id: string } }> }).suggestions.map(({ media }) => media._id)).toContain(mediaId);

    const exported = runWorker('export', batch, mediaId);
    expect(exported.status, exported.stderr).toBe(0);
    const manifest = JSON.parse(await readFile(join(batch, 'manifest.json'), 'utf8')) as { items: Array<{ mediaAssetId: string; imagePath: string }> };
    expect(manifest.items.map((item) => item.mediaAssetId)).toContain(mediaId);
    expect(manifest.items[0]).toHaveProperty('imagePath');

    expect(manifest.items).toHaveLength(1);
    const outputs = manifest.items.map((item) => ({ mediaAssetId: item.mediaAssetId, concepts: ['coast', 'blue water'], description: 'A small blue coastal scene.' }));
    await writeFile(join(batch, 'results.json'), JSON.stringify({ schemaVersion: 1, results: outputs }, null, 2));
    await db.collection('media_assets').updateOne({ _id: mediaId }, { $set: { updatedAt: new Date(Date.now() + 1000) } });
    expect(runWorker('import', batch).status).toBe(0);
    expect((await db.collection('media_enrichments').findOne({ mediaAssetId: mediaId }))?.status).toBe('pending');

    retryBatch = await mkdtemp(join(tmpdir(), 'media-enrichment-retry-'));
    const freshExport = runWorker('export', retryBatch, mediaId);
    expect(freshExport.status, freshExport.stderr).toBe(0);
    const freshManifest = JSON.parse(await readFile(join(retryBatch, 'manifest.json'), 'utf8')) as typeof manifest;
    const freshOutputs = freshManifest.items.map((item) => ({ mediaAssetId: item.mediaAssetId, concepts: ['coast', 'blue water'], description: 'A small blue coastal scene.' }));
    await writeFile(join(retryBatch, 'results.json'), JSON.stringify({ schemaVersion: 1, results: freshOutputs }, null, 2));
    const imported = runWorker('import', retryBatch);
    expect(imported.status, imported.stderr).toBe(0);
    const enrichment = await db.collection('media_enrichments').findOne({ mediaAssetId: mediaId });
    expect(enrichment?.status).toBe('ready');
    expect(enrichment?.source).toBe('codex-vision');
    expect(enrichment?.countryCode).toBe('EG');
    expect(await readFile(join(retryBatch, freshManifest.items.find((item) => item.mediaAssetId === mediaId)!.imagePath))).toBeTruthy();

    const duplicate = runWorker('import', retryBatch);
    expect(duplicate.status, duplicate.stderr).toBe(0);
    expect((await db.collection('media_enrichments').findOne({ mediaAssetId: mediaId }))?.concepts).toEqual(['coast', 'blue water']);

    await writeFile(join(retryBatch, 'results.json'), JSON.stringify({ schemaVersion: 1, results: [...freshOutputs, { mediaAssetId: 'unknown-id', concepts: ['unknown'], description: 'Unknown' }] }));
    const rejected = runWorker('import', retryBatch);
    expect(rejected.status).not.toBe(0);
    expect((await db.collection('media_enrichments').findOne({ mediaAssetId: mediaId }))?.concepts).toEqual(['coast', 'blue water']);
    await writeFile(join(retryBatch, 'results.json'), JSON.stringify({ schemaVersion: 1, results: [{ ...freshOutputs[0], unexpected: 'no' }] }));
    expect(runWorker('import', retryBatch).status).not.toBe(0);
    await writeFile(join(retryBatch, 'results.json'), JSON.stringify({ schemaVersion: 1, results: freshOutputs }, null, 2));

    const created = await page.request.post('/api/admin/collections', { data: { name: `Worker coast ${Date.now()}`, suggestionRule: { kind: 'subject', query: 'coast' } } });
    expect(created.status()).toBe(201);
    const collectionId = (await created.json() as { collection: { _id: string } }).collection._id;
    collectionIds.push(collectionId);
    const suggestions = await page.request.get(`/api/admin/collections/${collectionId}/suggestions`);
    expect((await suggestions.json() as { suggestions: Array<{ media: { _id: string } }> }).suggestions.map(({ media }) => media._id)).toContain(mediaId);

    await db.collection('media_assets').updateOne({ _id: mediaId }, { $set: { updatedAt: new Date(Date.now() + 1000) } });
    await writeFile(join(retryBatch, 'results.json'), JSON.stringify({ schemaVersion: 1, results: [{ ...freshOutputs[0], concepts: ['changed'] }] }));
    expect(runWorker('import', retryBatch).status).toBe(0);
    expect((await db.collection('media_enrichments').findOne({ mediaAssetId: mediaId }))?.concepts).toEqual(['coast', 'blue water']);
    await page.request.delete(`/api/admin/media/${mediaId}`);
    expect(runWorker('import', retryBatch).status).toBe(0);
    expect(await db.collection('media_enrichments').findOne({ mediaAssetId: mediaId })).toBeNull();

    const artifact = { mediaId, manifest: freshManifest, enrichment: { status: enrichment?.status, source: enrichment?.source, concepts: enrichment?.concepts }, staleRevisionSkipped: true, invalidImportRejected: true, deletedMediaNotResurrected: true };
    await writeFile(test.info().outputPath('media-enrichment-worker-result.json'), JSON.stringify(artifact, null, 2));
    await test.info().attach('media-enrichment-worker-result.json', { path: test.info().outputPath('media-enrichment-worker-result.json'), contentType: 'application/json' });
  } finally {
    for (const id of collectionIds) await page.request.delete(`/api/admin/collections/${id}`);
    if (mediaId) await page.request.delete(`/api/admin/media/${mediaId}`);
    if (connected) await mongo.close();
    await rm(batch, { recursive: true, force: true });
    if (retryBatch) await rm(retryBatch, { recursive: true, force: true });
  }
});
