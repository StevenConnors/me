import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { expect, test } from '@playwright/test';
import { MongoClient } from 'mongodb';

const FIXTURES = resolve(__dirname, 'fixtures/apple-photos');
const TOKEN = 'e2e-photos-import-token-0123456789abcdef';

type Block = { id: string; type: 'section' | 'media'; title?: string; mediaAssetId?: string; albumRole?: string; caption?: string };
type FakePhoto = { favorite?: boolean; editedAt?: string; size?: [number, number]; keywords?: string[]; description?: string; exportFails?: boolean };

test('Mac sync script uploads favorites from a Photos.app folder into the Photos draft', async ({ baseURL }) => {
  test.setTimeout(120_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e', { serverSelectionTimeoutMS: 10_000 });
  await mongo.connect();
  const db = mongo.db();
  const pages = db.collection<{ _id: string } & Record<string, unknown>>('photos_pages');
  const imports = db.collection<{ _id: string } & Record<string, unknown>>('apple_photos_imports');
  const mediaAssets = db.collection<{ _id: string } & Record<string, unknown>>('media_assets');
  const originalPage = await pages.findOne({ _id: 'photos' });
  const originalImports = await imports.findOne({ _id: 'apple-photos' });
  const startedAt = new Date();
  const libraryPath = test.info().outputPath('library.json');
  const sipsLog = test.info().outputPath('sips.log');
  const observations: Record<string, unknown> = {};

  const photos: Record<string, FakePhoto> = {
    p1: {},
    p2: { size: [6000, 4000], description: 'Cedar steps' },
    p3: { favorite: false },
    p4: { keywords: ['Cover'] },
    p5: {},
    p8: {},
  };
  const folders = () => [
    // In the sidebar: Kumano, then the Africa folder, then Alps.
    { title: 'Website', albums: [
      { uuid: 'album-kumano', title: 'Kumano', photos: ['p1', 'p2', 'p3', 'p4'], order: 1 },
      { uuid: 'album-alps', title: 'Alps', photos: ['p8'], order: 3 },
    ], subfolders: [{ title: 'Africa', order: 2, albums: [{ uuid: 'album-egypt', title: 'Egypt', photos: ['p5'] }] }] },
    { title: 'Private', albums: [{ uuid: 'album-private', title: 'Private', photos: ['p1'] }] },
  ];
  const writeLibrary = (folderList = folders()) => writeFile(libraryPath, JSON.stringify({ folders: folderList, photos }));
  const run = async (...args: string[]) => {
    try {
      const { stdout, stderr } = await promisify(execFile)('node', ['scripts/apple-photos-sync.mjs', ...args], {
        env: {
          ...process.env,
          PHOTOS_IMPORT_SITE_URL: baseURL, PHOTOS_IMPORT_TOKEN: TOKEN,
          APPLE_PHOTOS_PYTHON: 'python3', PYTHONPATH: FIXTURES, PYTHONDONTWRITEBYTECODE: '1',
          PATH: `${join(FIXTURES, 'bin')}:${process.env.PATH}`,
          FAKE_PHOTOS_LIBRARY: libraryPath, FAKE_SIPS_LOG: sipsLog,
          APPLE_PHOTOS_SYNC_JOURNAL: test.info().outputPath('journal.json'),
        },
      });
      return { code: 0, output: stdout + stderr };
    } catch (error) {
      const failure = error as { code: number; stdout: string; stderr: string };
      return { code: failure.code, output: failure.stdout + failure.stderr };
    }
  };
  const draft = async () => (await pages.findOne({ _id: 'photos' }))?.draftDocument as { blocks: Block[] };
  const sourceMedia = async () => new Map(((await imports.findOne({ _id: 'apple-photos' }))?.photos as Array<{ sourcePhotoId: string; mediaAssetId: string }> ?? [])
    .map((photo) => [photo.sourcePhotoId, photo.mediaAssetId]));
  const shape = async () => {
    const ids = new Map(Array.from(await sourceMedia()).map(([source, media]) => [media, source]));
    return (await draft()).blocks.map((block) => block.type === 'section' ? `section:${block.title}` : `${ids.get(block.mediaAssetId ?? '') ?? block.mediaAssetId}${block.albumRole ? `:${block.albumRole}` : ''}`);
  };
  const uploads = () => mediaAssets.countDocuments({ createdAt: { $gte: startedAt } });

  try {
    const now = new Date();
    const empty = { schemaVersion: 1, blocks: [] };
    await pages.replaceOne({ _id: 'photos' }, { _id: 'photos', schemaVersion: 1, draftDocument: empty, draftVersion: 1, createdAt: now, updatedAt: now }, { upsert: true });
    await imports.deleteOne({ _id: 'apple-photos' });
    await writeLibrary();

    const report = await run();
    expect(report.code).toBe(0);
    expect(report.output).toContain('"Website": 3 albums, 5 photos, 5 to upload');
    expect(report.output).not.toContain(TOKEN);
    expect(await uploads()).toBe(0);
    expect((await draft()).blocks).toEqual([]);

    const first = await run('--apply');
    expect(first.code).toBe(0);
    expect(await shape()).toEqual(['section:Kumano', 'p1', 'p2', 'p4:cover', 'section:Egypt', 'p5', 'section:Alps', 'p8']);
    expect((await draft()).blocks.find((block) => block.caption)).toMatchObject({ caption: 'Cedar steps' });
    const sips = (await readFile(sipsLog, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(sips).toHaveLength(5);
    for (const call of sips) expect(call.args.slice(0, 4)).toEqual(['-s', 'format', 'jpeg', '-s']);
    expect(sips.filter((call) => call.args.includes('-Z')).map((call) => call.source)).toEqual(['p2.jpeg']);
    expect(sips.find((call) => call.source === 'p2.jpeg').args.slice(-2)).toEqual(['-Z', '4096']);
    expect(await uploads()).toBe(5);
    observations.firstRun = first.output.trim().split('\n');

    const repeat = await run('--apply');
    expect(repeat.output).toContain('0 to upload');
    expect(repeat.output).toContain('already matches');
    expect(await uploads()).toBe(5);

    // Favoriting in Photos is not an edit; editing p1 is. p5 leaves the folder.
    photos.p3.favorite = true;
    photos.p1.editedAt = '2026-11-20T10:00:00+09:00';
    const oldP1 = (await sourceMedia()).get('p1');
    await writeLibrary([{ title: 'Website', albums: [{ uuid: 'album-kumano', title: 'Kumano', photos: ['p1', 'p2', 'p3', 'p4'] }] }]);
    const second = await run('--apply');
    expect(second.output).toContain('2 to upload');
    expect(await shape()).toEqual(['section:Kumano', 'p1', 'p2', 'p4:cover', 'p3']);
    expect((await sourceMedia()).get('p1')).not.toBe(oldP1);
    expect(await mediaAssets.countDocuments({ _id: oldP1 })).toBe(1);

    // One photo failing to export does not stop the others, and the run exits non-zero.
    photos.p6 = { exportFails: true };
    // An edit whose export fails keeps the synced version in the draft.
    photos.p2 = { ...photos.p2, editedAt: '2026-11-21T09:00:00+09:00', exportFails: true };
    photos.p7 = {};
    await writeLibrary([{ title: 'Website', albums: [{ uuid: 'album-kumano', title: 'Kumano', photos: ['p1', 'p2', 'p3', 'p4', 'p6', 'p7'] }] }]);
    const partial = await run('--apply');
    expect(partial.code).toBe(1);
    expect(partial.output).toContain('Skipped p6');
    expect(partial.output).toContain('Skipped p2');
    expect(await shape()).toEqual(['section:Kumano', 'p1', 'p2', 'p4:cover', 'p3', 'p7']);
    observations.partialRun = partial.output.trim().split('\n');
    expect((await pages.findOne({ _id: 'photos' }))?.publishedDocument).toBeUndefined();
  } finally {
    await mediaAssets.deleteMany({ createdAt: { $gte: startedAt }, providerAssetId: /^e2e-/ });
    if (originalPage) await pages.replaceOne({ _id: 'photos' }, originalPage);
    else await pages.deleteOne({ _id: 'photos' });
    if (originalImports) await imports.replaceOne({ _id: 'apple-photos' }, originalImports);
    else await imports.deleteOne({ _id: 'apple-photos' });
    await mongo.close();
    const path = test.info().outputPath('e2e-fixture-apple-photos-sync-script.json');
    await writeFile(path, JSON.stringify(observations, null, 2));
    await test.info().attach('e2e-fixture-apple-photos-sync-script.json', { path, contentType: 'application/json' });
  }
});
