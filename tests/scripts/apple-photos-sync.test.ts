import { describe, expect, it } from 'vitest';

import { buildSyncRequest, knownMedia, planUploads } from '../../scripts/apple-photos-sync.mjs';

const photo = (sourcePhotoId: string, sourceVersion = 'original') => ({ sourcePhotoId, sourceVersion, cover: false });
const albums = [
  { sourceAlbumId: 'a', title: 'Kumano', photos: [photo('p1'), photo('p2', 'edited-2')] },
  { sourceAlbumId: 'b', title: 'Egypt', photos: [photo('p2', 'edited-2'), photo('p3')] },
];

describe('Apple Photos sync script', () => {
  it('uploads only new or edited photos, once each', () => {
    const known = knownMedia(
      { photos: [{ sourcePhotoId: 'p1', sourceVersion: 'original', mediaAssetId: 'm1' }, { sourcePhotoId: 'p2', sourceVersion: 'original', mediaAssetId: 'm2' }] },
      {},
    );
    expect(planUploads(albums, known).map((entry) => entry.sourcePhotoId)).toEqual(['p2', 'p3']);
  });

  it('reuses uploads from the local journal that never reached a sync', () => {
    const known = knownMedia({ photos: [] }, { 'p3@original': 'm3' });
    expect(planUploads(albums, known).map((entry) => entry.sourcePhotoId)).toEqual(['p1', 'p2']);
  });

  it('prefers the server manifest over the journal', () => {
    const known = knownMedia({ photos: [{ sourcePhotoId: 'p1', sourceVersion: 'original', mediaAssetId: 'server' }] }, { 'p1@original': 'local' });
    expect(known.get('p1@original')).toBe('server');
  });

  it('sends only photos that have media, keeping album order', () => {
    const known = new Map([['p1@original', 'm1'], ['p3@original', 'm3']]);
    expect(buildSyncRequest(albums, known)).toEqual({
      albums: [
        { sourceAlbumId: 'a', title: 'Kumano', photos: [{ ...photo('p1'), mediaAssetId: 'm1' }] },
        { sourceAlbumId: 'b', title: 'Egypt', photos: [{ ...photo('p3'), mediaAssetId: 'm3' }] },
      ],
    });
  });
});
