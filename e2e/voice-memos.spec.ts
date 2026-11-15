import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { getPayloadFromClientToken } from '@vercel/blob/client';

import { MongoClient, ObjectId } from 'mongodb';
import { expect, test } from '@playwright/test';

// Defined before the implementation: reject unauthorized workers, invalid IDs,
// metadata, cross-owner reads, concurrent claims, stale writes and changed retries;
// preserve originals and previous transcripts on failure; connect upload -> DB ->
// actual CLI -> correct recording -> rendered text, including Japanese segments.
const token = 'voice-e2e-worker-token-00000000000000000000';
const workerHeaders = { Authorization: `Bearer ${token}` };

function waveFixture() {
  const audio = Buffer.alloc(44 + 3200);
  audio.write('RIFF', 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28); audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(3200, 40);
  return audio;
}

function runCli(args: string[], moduleDirectory: string, baseURL: string, command = 'pending') {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn('python3', ['scripts/transcribe.py', command, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, APP_BASE_URL: baseURL, VOICE_TRANSCRIBER_API_TOKEN: token, PYTHONPATH: moduleDirectory },
    });
    let output = '';
    child.stdout.on('data', (value: Buffer) => { output += value.toString(); });
    child.stderr.on('data', (value: Buffer) => { output += value.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

test('private mobile voice upload, worker claims, transcripts, recovery and ownership', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  const temporary = await mkdtemp(join(tmpdir(), 'voice-cli-e2e-'));
  const ids: string[] = [];
  await mongo.connect();
  const recordings = mongo.db().collection('voice_recordings');
  try {
    // A valid PCM WAV exercises the same original-byte storage/download path as M4A.
    const audio = waveFixture();
    const title = `Voice integration ${Date.now()}`;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/recordings');
    await expect(page.getByRole('heading', { name: 'Voice memos' })).toBeVisible();
    await page.getByLabel(/^Title/).fill(title);
    await page.getByLabel(/^Notes/).fill('English and Japanese');
    await page.getByLabel('Audio file').setInputFiles({ name: '日本語メモ.wav', mimeType: 'audio/wav', buffer: audio });
    await page.getByRole('button', { name: 'Upload Voice Memo', exact: true }).click();
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await expect(card).toBeVisible();
    await expect(card.getByText('Pending', { exact: true })).toBeVisible();
    const id = await card.getAttribute('data-recording-id');
    expect(id).toMatch(/^[a-f0-9]{24}$/);
    ids.push(id!);
    const original = await recordings.findOne({ _id: id as never });
    expect(original?.ownerId).toBe('e2e-author');
    expect(original?.byteSize).toBe(audio.length);
    const download = await page.request.get(`/api/voice/recordings/${id}/audio`, { headers: workerHeaders });
    expect(download.ok()).toBe(true);
    expect(await download.body()).toEqual(audio);
    const range = await page.request.get(`/api/voice/recordings/${id}/audio`, { headers: { ...workerHeaders, Range: 'bytes=0-15' } });
    expect(range.status()).toBe(206);
    expect(await range.body()).toEqual(audio.subarray(0, 16));
    const suffixRange = await page.request.get(`/api/voice/recordings/${id}/audio`, { headers: { ...workerHeaders, Range: 'bytes=-16' } });
    expect(suffixRange.status()).toBe(206);
    expect(await suffixRange.body()).toEqual(audio.subarray(audio.length - 16));
    const pending = await page.request.get('/api/voice/recordings/pending', { headers: workerHeaders });
    expect(pending.ok()).toBe(true);
    expect((await pending.json()).recordings.map((item: { _id: string }) => item._id)).toContain(id);
    expect((await page.request.get('/api/voice/recordings/pending', { headers: { Authorization: 'Bearer invalid' } })).status()).toBe(401);
    expect((await page.request.get('/api/voice/recordings/not-an-id', { headers: workerHeaders })).status()).toBe(400);
    const claim = await page.request.post(`/api/voice/recordings/${id}/claim`, { headers: workerHeaders, data: {} });
    expect(claim.ok()).toBe(true);
    const { claimId } = await claim.json();
    expect((await page.request.post(`/api/voice/recordings/${id}/claim`, { headers: workerHeaders, data: { force: true } })).status()).toBe(409);
    expect((await page.request.post(`/api/voice/recordings/${id}/transcription`, { headers: workerHeaders, data: { claimId: 'stale-claim', text: 'Wrong', model: 'test', language: 'en', durationSeconds: 0.1, segments: [] } })).status()).toBeGreaterThanOrEqual(400);
    const payload = { claimId, text: 'Hello. こんにちは。', language: 'ja', model: 'mlx-community/whisper-medium-mlx', durationSeconds: 0.1, segments: [{ start: 0, end: 0.1, text: 'Hello. こんにちは。' }] };
    expect((await page.request.post(`/api/voice/recordings/${id}/transcription`, { headers: workerHeaders, data: payload })).ok()).toBe(true);
    expect((await page.request.post(`/api/voice/recordings/${id}/transcription`, { headers: workerHeaders, data: payload })).ok()).toBe(true);
    expect((await page.request.post(`/api/voice/recordings/${id}/transcription`, { headers: workerHeaders, data: { ...payload, text: 'Changed retry' } })).status()).toBe(409);
    await page.reload();
    await expect(card.getByText('Completed', { exact: true })).toBeVisible();
    await expect(card.getByText(payload.text, { exact: true }).first()).toBeVisible();
    await expect(card.getByRole('button', { name: 'Copy transcript' })).toBeVisible();
    const forced = await page.request.post(`/api/voice/recordings/${id}/claim`, { headers: workerHeaders, data: { force: true } });
    expect(forced.ok()).toBe(true);
    const forcedClaim = (await forced.json()).claimId;
    await page.reload();
    await expect(card.getByText('Processing', { exact: true })).toBeVisible();
    expect((await page.request.post(`/api/voice/recordings/${id}/heartbeat`, { headers: workerHeaders, data: { claimId: forcedClaim } })).ok()).toBe(true);
    expect((await page.request.post(`/api/voice/recordings/${id}/failure`, { headers: workerHeaders, data: { claimId: forcedClaim, error: 'Local decoding failed' } })).ok()).toBe(true);
    await page.reload();
    await expect(card.getByText('Failed', { exact: true })).toBeVisible();
    await expect(card.getByText(payload.text, { exact: true }).first()).toBeVisible();
    expect((await recordings.findOne({ _id: id as never }))?.transcriptText).toBe(payload.text);
    const afterFailure = await page.request.get('/api/voice/recordings/pending', { headers: workerHeaders });
    expect((await afterFailure.json()).recordings.map((item: { _id: string }) => item._id)).not.toContain(id);
    await recordings.updateOne({ _id: id as never }, { $set: { ownerId: 'another-author', status: 'pending' } });
    expect((await page.request.get(`/api/voice/recordings/${id}`, { headers: workerHeaders })).status()).toBe(404);
    expect((await page.request.get(`/api/voice/recordings/${id}/audio`, { headers: workerHeaders })).status()).toBe(404);
    expect((await page.request.post(`/api/voice/recordings/${id}/claim`, { headers: workerHeaders, data: {} })).status()).toBe(404);
    const foreignPending = await page.request.get('/api/voice/recordings/pending', { headers: workerHeaders });
    expect((await foreignPending.json()).recordings.map((item: { _id: string }) => item._id)).not.toContain(id);
    await recordings.updateOne({ _id: id as never }, { $set: { ownerId: 'e2e-author', status: 'failed' } });

    // Execute the real worker with deterministic local inference. No network model
    // download or paid transcription service is involved in this integration test.
    await writeFile(join(temporary, 'mlx_whisper.py'), 'def transcribe(audio, **kwargs):\n    return {"text":"CLI 日本語 transcript", "language":"ja", "segments":[{"start":0.0,"end":0.1,"text":"CLI 日本語 transcript"}]}\n');
    const executed = await runCli(['--id', id!, '--force'], temporary, baseURL!);
    expect(executed.code, executed.output).toBe(0);
    expect(executed.output).not.toContain(token);
    const completed = await recordings.findOne({ _id: id as never });
    expect(completed?.status).toBe('completed');
    expect(completed?.transcriptText).toBe('CLI 日本語 transcript');
    expect(completed?.segments).toHaveLength(1);
    expect(completed?.blobPathname).toBe(original?.blobPathname);
    const repeated = await runCli(['--id', id!], temporary, baseURL!);
    expect(repeated.code, repeated.output).toBe(0);
    await page.reload();
    await expect(card.getByText('CLI 日本語 transcript', { exact: true }).first()).toBeVisible();
    expect(await page.locator('body').innerText()).not.toContain(token);
    const resultPath = testInfo.outputPath('voice-workflow-result.json');
    await mkdir(join(resultPath, '..'), { recursive: true });
    await writeFile(resultPath, JSON.stringify({ recordingId: id, originalBytesPreserved: true, rangePlaybackVerified: true, ownershipVerified: true, duplicateClaimRejected: true, idempotentSubmissionVerified: true, failedReprocessPreservedTranscript: true, cliExecuted: true, inference: 'deterministic local test module', status: completed?.status, transcript: completed?.transcriptText }, null, 2));
    await testInfo.attach('voice-workflow-result.json', { path: resultPath, contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath('voice-mobile-completed.png'), fullPage: true });
    expect(await readFile(resultPath, 'utf8')).toContain('originalBytesPreserved');
  } finally {
    for (const id of ids) {
      await recordings.deleteOne({ _id: id as never });
      await rm(join(tmpdir(), 'voice-e2e-uploads', `${id}.audio`), { force: true });
    }
    await mongo.close();
    await rm(temporary, { recursive: true, force: true });
  }
});

test('saved CLI output survives a submission outage and refuses stale recovery overwrites', async ({ request, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  await mongo.connect();
  const records = mongo.db().collection('voice_recordings');
  const temporary = await mkdtemp(join(tmpdir(), 'voice-recovery-e2e-'));
  const id = new ObjectId().toHexString();
  let recoveryFile: string | undefined;
  let rejectSubmission = true;
  const proxy = createServer(async (incoming, outgoing) => {
    try {
      if (rejectSubmission && incoming.url?.endsWith('/transcription')) {
        outgoing.writeHead(503, { 'Content-Type': 'application/json' });
        outgoing.end(JSON.stringify({ error: { message: 'Temporary submission outage' } }));
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const response = await fetch(`${baseURL}${incoming.url}`, {
        method: incoming.method,
        headers: { Authorization: incoming.headers.authorization ?? '', 'Content-Type': incoming.headers['content-type'] ?? 'application/json' },
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      });
      outgoing.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') ?? 'application/json' });
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(502); outgoing.end();
    }
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  try {
    const uploaded = await request.post('/api/e2e/voice-upload', { multipart: { recordingId: id, title: 'Recovery fixture', file: { name: 'recover.wav', mimeType: 'audio/wav', buffer: waveFixture() } } });
    expect(uploaded.ok()).toBe(true);
    await writeFile(join(temporary, 'mlx_whisper.py'), 'def transcribe(audio, **kwargs):\n    return {"text":"Recovered locally", "language":"en", "segments":[{"start":0.0,"end":0.1,"text":"Recovered locally"}]}\n');
    const executed = await runCli(['--id', id], temporary, `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`);
    expect(executed.code, executed.output).toBe(1);
    recoveryFile = executed.output.match(/Saved the exact payload to (.+?\.json);/)?.[1];
    expect(recoveryFile).toBeTruthy();
    const saved = JSON.parse(await readFile(recoveryFile!, 'utf8'));
    expect(saved.payload.text).toBe('Recovered locally');
    expect(JSON.stringify(saved)).not.toContain(token);
    expect((await records.findOne({ _id: id as never }))?.status).toBe('processing');
    rejectSubmission = false;
    await records.updateOne({ _id: id as never }, { $set: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    const recovered = await runCli([recoveryFile!], temporary, baseURL!, 'retry');
    expect(recovered.code, recovered.output).toBe(0);
    expect((await records.findOne({ _id: id as never }))?.transcriptText).toBe('Recovered locally');
    saved.force = true;
    saved.payload.text = 'Stale recovery must never replace the newer transcript';
    await writeFile(recoveryFile!, JSON.stringify(saved));
    const stale = await runCli([recoveryFile!], temporary, baseURL!, 'retry');
    expect(stale.code).toBe(2);
    expect((await records.findOne({ _id: id as never }))?.transcriptText).toBe('Recovered locally');
    const path = testInfo.outputPath('voice-recovery-result.json');
    await writeFile(path, JSON.stringify({ savedWithoutRepeatingInference: true, originalClaimPreservedOnOutage: true, expiredClaimReacquired: true, staleRecoveryRejected: true }, null, 2));
    await testInfo.attach('voice-recovery-result.json', { path, contentType: 'application/json' });
  } finally {
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    await records.deleteOne({ _id: id as never });
    await rm(join(tmpdir(), 'voice-e2e-uploads', `${id}.audio`), { force: true });
    if (recoveryFile) await rm(recoveryFile, { force: true });
    await mongo.close();
    await rm(temporary, { recursive: true, force: true });
  }
});

test('the CLI drains more than one pending page and recovers expired claims', async ({ request, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  await mongo.connect();
  const temporary = await mkdtemp(join(tmpdir(), 'voice-batch-e2e-'));
  const audio = waveFixture();
  const ids = Array.from({ length: 101 }, () => new ObjectId().toHexString());
  const records = mongo.db().collection('voice_recordings');
  try {
    await mkdir(join(tmpdir(), 'voice-e2e-uploads'), { recursive: true });
    await Promise.all(ids.map((id) => writeFile(join(tmpdir(), 'voice-e2e-uploads', `${id}.audio`), audio, { mode: 0o600 })));
    await records.insertMany(ids.map((id, index) => ({
      _id: id as never, ownerId: 'e2e-author', title: `Batch ${index}`, originalFilename: `${id}.wav`,
      mimeType: 'audio/wav', byteSize: audio.length, blobUrl: `e2e-private://${id}`, blobPathname: `voice/${id}/original.wav`,
      status: 'pending', createdAt: new Date(), updatedAt: new Date(), uploadedAt: new Date(),
    })));
    const claimed = await request.post(`/api/voice/recordings/${ids[0]}/claim`, { headers: workerHeaders, data: {} });
    const oldClaim = (await claimed.json()).claimId;
    await records.updateOne({ _id: ids[0] as never }, { $set: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    expect((await request.post(`/api/voice/recordings/${ids[0]}/heartbeat`, { headers: workerHeaders, data: { claimId: oldClaim } })).status()).toBe(409);
    expect((await request.post(`/api/voice/recordings/${ids[0]}/transcription`, { headers: workerHeaders, data: { claimId: oldClaim, text: 'Stale', model: 'test', language: 'en', segments: [] } })).status()).toBe(409);
    await writeFile(join(temporary, 'mlx_whisper.py'), 'def transcribe(audio, **kwargs):\n    return {"text":"Batch English 日本語", "language":"ja", "segments":[{"start":0.0,"end":0.1,"text":"Batch English 日本語"}]}\n');
    const executed = await runCli(['--all'], temporary, baseURL!);
    expect(executed.code, executed.output).toBe(0);
    expect(await records.countDocuments({ _id: { $in: ids as never }, status: 'completed', transcriptText: 'Batch English 日本語' })).toBe(101);
    const repeated = await runCli(['--all'], temporary, baseURL!);
    expect(repeated.code, repeated.output).toBe(0);
    expect(repeated.output).toContain('No pending recordings');
    const path = testInfo.outputPath('voice-batch-result.json');
    await writeFile(path, JSON.stringify({ count: 101, allPendingPagesProcessed: true, expiredClaimRecovered: true, staleClaimRejected: true, repeatedRunSafe: true }, null, 2));
    await testInfo.attach('voice-batch-result.json', { path, contentType: 'application/json' });
  } finally {
    await records.deleteMany({ _id: { $in: ids as never } });
    await Promise.all(ids.map((id) => rm(join(tmpdir(), 'voice-e2e-uploads', `${id}.audio`), { force: true })));
    await mongo.close();
    await rm(temporary, { recursive: true, force: true });
  }
});

test('Blob upload authorization validates iOS metadata and rejects forged callbacks', async ({ request }, testInfo) => {
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e');
  await mongo.connect();
  const id = 'abcdefabcdefabcdefabcdef';
  const pathname = `voice/${id}/original.m4a`;
  const metadata = { recordingId: id, originalFilename: 'iPhone memo.m4a', mimeType: 'audio/x-m4a', byteSize: 128, title: 'iOS type validation' };
  const tokenRequest = (value: object, path = pathname) => ({ type: 'blob.generate-client-token', payload: { pathname: path, clientPayload: JSON.stringify(value), multipart: true } });
  try {
    expect((await request.post('/api/admin/recordings/upload', { data: tokenRequest({ ...metadata, byteSize: 250 * 1024 * 1024 + 1 }) })).status()).toBe(400);
    expect((await request.post('/api/admin/recordings/upload', { data: tokenRequest({ ...metadata, originalFilename: 'not-audio.exe' }) })).status()).toBe(400);
    expect((await request.post('/api/admin/recordings/upload', { data: tokenRequest(metadata, 'arbitrary/path.m4a') })).status()).toBe(400);
    expect((await request.post('/api/admin/recordings/upload', { data: '{broken json', headers: { 'Content-Type': 'application/json' } })).status()).toBe(400);
    const authorized = await request.post('/api/admin/recordings/upload', { data: tokenRequest(metadata) });
    expect(authorized.status(), await authorized.text()).toBe(200);
    const { clientToken } = await authorized.json();
    const constraints = getPayloadFromClientToken(clientToken);
    expect(constraints.pathname).toBe(pathname);
    expect(constraints.allowedContentTypes).toEqual(['audio/mp4']);
    expect(constraints.maximumSizeInBytes).toBe(metadata.byteSize);
    expect(constraints.allowOverwrite).toBe(false);
    expect(constraints.validUntil).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000);
    const forged = await request.post('/api/admin/recordings/upload', { data: { type: 'blob.upload-completed', payload: { blob: { url: 'https://attacker.example/audio.m4a', pathname, contentType: 'audio/mp4' }, tokenPayload: JSON.stringify({ ownerId: 'e2e-author', metadata, pathname }) } } });
    expect(forged.status()).toBe(400);
    expect((await mongo.db().collection('voice_recordings').findOne({ _id: id as never }))?.status).toBe('uploading');
    const path = testInfo.outputPath('voice-upload-authorization.json');
    await writeFile(path, JSON.stringify({ exactPath: constraints.pathname, acceptedIOSMime: 'audio/x-m4a', storedMime: constraints.allowedContentTypes, exactByteLimit: constraints.maximumSizeInBytes, forgedCallbackRejected: true }, null, 2));
    await testInfo.attach('voice-upload-authorization.json', { path, contentType: 'application/json' });
  } finally {
    await mongo.db().collection('voice_recordings').deleteOne({ _id: id as never });
    await mongo.close();
  }
});
