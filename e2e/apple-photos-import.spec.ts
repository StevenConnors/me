import { writeFile } from 'node:fs/promises';

import { expect, test, type APIRequestContext } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

const TOKEN = 'e2e-photos-import-token-0123456789abcdef';
const auth = { Authorization: `Bearer ${TOKEN}` };

type Block = { id: string; type: 'section' | 'media'; title?: string; mediaAssetId?: string; albumRole?: string; altText?: string; caption?: string };
type Photo = [sourcePhotoId: string, sourceVersion: string, mediaAssetId: string, cover?: boolean];

const syncBody = (albums: Array<{ id: string; title: string; photos: Photo[] }>) => ({
  albums: albums.map((album) => ({
    sourceAlbumId: album.id,
    title: album.title,
    photos: album.photos.map(([sourcePhotoId, sourceVersion, mediaAssetId, cover]) => ({ sourcePhotoId, sourceVersion, mediaAssetId, cover: Boolean(cover) })),
  })),
});

async function uploadWithToken(request: APIRequestContext, filename: string): Promise<string> {
  const idempotencyKey = new ObjectId().toHexString();
  const authorization = await request.post('/api/admin/media/upload-authorizations', {
    headers: auth, data: { filename, mimeType: 'image/jpeg', bytes: 68, idempotencyKey, resourceType: 'image' },
  });
  expect(authorization.status()).toBe(200);
  const { authorization: { uploadUrl, parameters } } = await authorization.json();
  const upload = await request.post(uploadUrl, { multipart: { ...parameters, file: { name: filename, mimeType: 'image/jpeg', buffer: Buffer.from('jpeg') } } });
  const result = await upload.json();
  const finalized = await request.post('/api/admin/media/finalize', {
    headers: auth,
    data: { idempotencyKey, result: {
      providerAssetId: result.asset_id, providerPublicId: result.public_id, resourceType: result.resource_type, deliveryType: result.type,
      version: result.version, originalFilename: result.original_filename, format: result.format, width: result.width, height: result.height,
      bytes: result.bytes, checksum: result.etag, tags: String(result.tags).split(','), signature: result.signature,
    } },
  });
  expect(finalized.status()).toBe(200);
  return (await finalized.json()).media._id;
}

test('Mac import syncs Photos.app albums into the Photos draft without undoing author edits', async ({ request }) => {
  test.setTimeout(120_000);
  const mongo = new MongoClient(process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/journey_editor_e2e', { serverSelectionTimeoutMS: 10_000 });
  await mongo.connect();
  const db = mongo.db();
  const pages = db.collection<{ _id: string } & Record<string, unknown>>('photos_pages');
  const imports = db.collection<{ _id: string } & Record<string, unknown>>('apple_photos_imports');
  const mediaAssets = db.collection<{ _id: string } & Record<string, unknown>>('media_assets');
  const originalPage = await pages.findOne({ _id: 'photos' });
  const originalImports = await imports.findOne({ _id: 'apple-photos' });
  const createdMedia: string[] = [];
  const observations: Record<string, unknown> = {};
  const media = async (overrides: Record<string, unknown> = {}) => {
    const id = new ObjectId().toHexString();
    const now = new Date();
    await mediaAssets.insertOne({
      _id: id, schemaVersion: 1, provider: 'cloudinary', providerAssetId: `e2e-${id}`, providerPublicId: `e2e/${id}`, resourceType: 'image',
      deliveryType: 'upload', version: 1, originalFilename: `${id}.jpg`, format: 'jpg', width: 400, height: 300, bytes: 100, tags: [],
      showInPhotos: false, status: 'ready', createdAt: now, updatedAt: now, ...overrides,
    });
    createdMedia.push(id);
    return id;
  };
  const draft = async () => {
    const page = await pages.findOne({ _id: 'photos' });
    return { version: page?.draftVersion as number, blocks: (page?.draftDocument as { blocks: Block[] }).blocks, published: page?.publishedDocument };
  };
  const shape = (blocks: Block[]) => blocks.map((block) => block.type === 'section' ? `section:${block.title}` : `${block.mediaAssetId}${block.albumRole ? `:${block.albumRole}` : ''}`);
  const sync = (body: unknown) => request.post('/api/admin/imports/apple-photos', { headers: auth, data: body });

  try {
    const authorMedia = await media({ altText: 'Hill' });
    const published = { schemaVersion: 1, blocks: [
      { id: new ObjectId().toHexString(), type: 'section', title: 'Earlier' },
      { id: new ObjectId().toHexString(), type: 'media', mediaAssetId: authorMedia, decorative: false, altText: 'Hill' },
    ] };
    const now = new Date();
    await pages.replaceOne({ _id: 'photos' }, { _id: 'photos', schemaVersion: 1, draftDocument: published, draftVersion: 1,
      publishedDocument: published, createdAt: now, updatedAt: now, publishedAt: now }, { upsert: true });
    await imports.deleteOne({ _id: 'apple-photos' });

    // Auth: the import endpoints refuse requests without the exact token.
    expect((await request.get('/api/admin/imports/apple-photos')).status()).toBe(401);
    expect((await request.get('/api/admin/imports/apple-photos', { headers: { Authorization: `Bearer ${TOKEN}x` } })).status()).toBe(401);
    expect((await request.post('/api/admin/imports/apple-photos', { data: syncBody([]) })).status()).toBe(401);

    const [m1, m2, m3] = [await uploadWithToken(request, 'kumano-1.jpg'), await uploadWithToken(request, 'kumano-2.jpg'), await uploadWithToken(request, 'egypt-1.jpg')];
    createdMedia.push(m1, m2, m3);

    // First sync: one section per album, photos in order, cover applied, nothing published.
    const firstBody = syncBody([
      { id: 'album-kumano', title: 'Kumano', photos: [['p1', 'v1', m1], ['p2', 'v1', m2, true]] },
      { id: 'album-egypt', title: 'Egypt', photos: [['p3', 'v1', m3]] },
    ]);
    const first = await sync(firstBody);
    expect(first.status()).toBe(200);
    const afterFirst = await draft();
    expect(shape(afterFirst.blocks)).toEqual(['section:Earlier', authorMedia, 'section:Kumano', m1, `${m2}:cover`, 'section:Egypt', m3]);
    expect(afterFirst.published).toEqual(published);
    const manifest = await (await request.get('/api/admin/imports/apple-photos', { headers: auth })).json();
    expect(manifest.photos).toEqual(expect.arrayContaining([
      { sourcePhotoId: 'p1', sourceVersion: 'v1', mediaAssetId: m1 },
      { sourcePhotoId: 'p2', sourceVersion: 'v1', mediaAssetId: m2 },
      { sourcePhotoId: 'p3', sourceVersion: 'v1', mediaAssetId: m3 },
    ]));

    // Same folder again: no draft write.
    const repeat = await (await sync(firstBody)).json();
    expect(repeat.draftChanged).toBe(false);
    expect((await draft()).version).toBe(afterFirst.version);

    // Author edits between syncs: retitle Egypt, annotate m1, move m3 into Kumano.
    const edited = afterFirst.blocks.map((block) => block.title === 'Egypt' ? { ...block, title: 'Cairo' }
      : block.mediaAssetId === m1 ? { ...block, altText: 'Cedar path', caption: 'Day two' } : block);
    const m3Block = edited.find((block) => block.mediaAssetId === m3) as Block;
    const reordered = edited.filter((block) => block !== m3Block);
    reordered.splice(reordered.findIndex((block) => block.mediaAssetId === m1) + 1, 0, m3Block);
    await pages.updateOne({ _id: 'photos' }, { $set: { 'draftDocument.blocks': reordered }, $inc: { draftVersion: 1 } });

    // m1 edited in Photos.app, p4 added to Egypt, p2 removed from the folder.
    const m1Edit = await media();
    const m4 = await media();
    const second = await sync(syncBody([
      { id: 'album-kumano', title: 'Kumano', photos: [['p1', 'v2', m1Edit]] },
      { id: 'album-egypt', title: 'Egypt', photos: [['p3', 'v1', m3], ['p4', 'v1', m4]] },
    ]));
    expect(second.status()).toBe(200);
    const afterSecond = await draft();
    expect(shape(afterSecond.blocks)).toEqual(['section:Earlier', authorMedia, 'section:Kumano', m1Edit, m3, 'section:Cairo', m4]);
    expect(afterSecond.blocks.find((block) => block.mediaAssetId === m1Edit)).toMatchObject({ altText: 'Cedar path', caption: 'Day two' });
    expect(await mediaAssets.countDocuments({ _id: m2 })).toBe(1);

    // Egypt leaves the folder: its photos go and the empty section is removed.
    await sync(syncBody([{ id: 'album-kumano', title: 'Kumano', photos: [['p1', 'v2', m1Edit]] }]));
    expect(shape((await draft()).blocks)).toEqual(['section:Earlier', authorMedia, 'section:Kumano', m1Edit]);

    // Unavailable media and oversized syncs are rejected without touching the draft.
    const before = await draft();
    const video = await media({ resourceType: 'video', format: 'mp4' });
    const pending = await media({ status: 'pending' });
    const unavailable = await sync(syncBody([{ id: 'album-bad', title: 'Bad', photos: [['v', 'v1', video], ['p', 'v1', pending], ['x', 'v1', new ObjectId().toHexString()]] }]));
    expect(unavailable.status()).toBe(400);
    expect((await unavailable.json()).error.code).toBe('APPLE_PHOTOS_MEDIA_UNAVAILABLE');
    const many = await Promise.all(Array.from({ length: 502 }, () => media()));
    const tooLarge = await sync(syncBody([
      { id: 'big-1', title: 'Big 1', photos: many.slice(0, 251).map((id, index): Photo => [`big-a-${index}`, 'v1', id]) },
      { id: 'big-2', title: 'Big 2', photos: many.slice(251).map((id, index): Photo => [`big-b-${index}`, 'v1', id]) },
    ]));
    expect(tooLarge.status()).toBe(400);
    expect((await tooLarge.json()).error.code).toBe('APPLE_PHOTOS_DRAFT_INVALID');
    expect(await draft()).toEqual(before);
    observations.finalDraft = shape(before.blocks).map((entry) => entry.replace(/[0-9a-f]{24}/g, '<media>'));
  } finally {
    await mediaAssets.deleteMany({ _id: { $in: createdMedia } });
    if (originalPage) await pages.replaceOne({ _id: 'photos' }, originalPage);
    else await pages.deleteOne({ _id: 'photos' });
    if (originalImports) await imports.replaceOne({ _id: 'apple-photos' }, originalImports);
    else await imports.deleteOne({ _id: 'apple-photos' });
    await mongo.close();
    const path = test.info().outputPath('e2e-fixture-apple-photos-import.json');
    await writeFile(path, JSON.stringify(observations, null, 2));
    await test.info().attach('e2e-fixture-apple-photos-import.json', { path, contentType: 'application/json' });
  }
});
