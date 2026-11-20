import { describe, expect, it } from 'vitest';

import { planApplePhotosSync } from '@/lib/photos/apple-import/plan';
import { ApplePhotosSyncRequestSchema } from '@/lib/photos/apple-import/schemas';
import type { PhotosPageDocument } from '@/lib/photos/schemas';

const ids = () => {
  let next = 0;
  return () => `new-${++next}`;
};

const request = (albums: Array<{ id: string; title: string; photos: Array<[string, string, string, boolean?]> }>) =>
  ApplePhotosSyncRequestSchema.parse({
    albums: albums.map((album) => ({
      sourceAlbumId: album.id,
      title: album.title,
      photos: album.photos.map(([sourcePhotoId, sourceVersion, mediaAssetId, cover]) => ({
        sourcePhotoId, sourceVersion, mediaAssetId, ...(cover ? { cover } : {}),
      })),
    })),
  });

const authorDocument: PhotosPageDocument = {
  schemaVersion: 1,
  blocks: [
    { id: 'author-section', type: 'section', title: 'Earlier' },
    { id: 'author-photo', type: 'media', mediaAssetId: 'author-media', decorative: false, altText: 'Hill' },
  ],
};

const summarize = (document: PhotosPageDocument) => document.blocks.map((block) => block.type === 'section'
  ? `section:${block.title}`
  : `${block.mediaAssetId}${block.albumRole ? `:${block.albumRole}` : ''}`);

describe('planApplePhotosSync', () => {
  it('appends one section per album with photos in order and keeps author blocks first', () => {
    const plan = planApplePhotosSync({
      document: authorDocument, albums: [], photos: [], createId: ids(),
      request: request([
        { id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1'], ['p2', 'v1', 'm2', true]] },
        { id: 'egypt', title: 'Egypt', photos: [['p3', 'v1', 'm3']] },
      ]),
    });
    expect(summarize(plan.document)).toEqual([
      'section:Earlier', 'author-media', 'section:Kumano', 'm1', 'm2:cover', 'section:Egypt', 'm3',
    ]);
    expect(plan.summary).toMatchObject({ albumsAdded: 2, photosAdded: 3 });
  });

  it('is a no-op the second time and appends new photos to their own album', () => {
    const createId = ids();
    const first = planApplePhotosSync({
      document: authorDocument, albums: [], photos: [], createId,
      request: request([
        { id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1']] },
        { id: 'egypt', title: 'Egypt', photos: [['p3', 'v1', 'm3']] },
      ]),
    });
    const again = planApplePhotosSync({ ...first, request: request([
      { id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1']] },
      { id: 'egypt', title: 'Egypt', photos: [['p3', 'v1', 'm3']] },
    ]), createId });
    expect(again.document).toEqual(first.document);

    const added = planApplePhotosSync({ ...first, request: request([
      { id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1'], ['p4', 'v1', 'm4']] },
      { id: 'egypt', title: 'Egypt', photos: [['p3', 'v1', 'm3']] },
    ]), createId });
    expect(summarize(added.document)).toEqual([
      'section:Earlier', 'author-media', 'section:Kumano', 'm1', 'm4', 'section:Egypt', 'm3',
    ]);
  });

  it('swaps edited media in place and keeps the author copy, role and position', () => {
    const createId = ids();
    const first = planApplePhotosSync({
      document: authorDocument, albums: [], photos: [], createId,
      request: request([{ id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1', true]] }]),
    });
    const edited: PhotosPageDocument = {
      ...first.document,
      blocks: first.document.blocks.map((block) => block.type === 'section' && block.title === 'Kumano'
        ? { ...block, title: 'Kumano Kodo' }
        : block.type === 'media' && block.mediaAssetId === 'm1' ? { ...block, altText: 'Cedar path', caption: 'Day two' } : block),
    };
    const next = planApplePhotosSync({ ...first, document: edited, createId,
      request: request([{ id: 'kumano', title: 'Kumano', photos: [['p1', 'v2', 'm1-edit']] }]) });
    const block = next.document.blocks.find((candidate) => candidate.type === 'media' && candidate.mediaAssetId === 'm1-edit');
    expect(block).toMatchObject({ altText: 'Cedar path', caption: 'Day two', albumRole: 'cover' });
    expect(summarize(next.document)).toEqual(['section:Earlier', 'author-media', 'section:Kumano Kodo', 'm1-edit:cover']);
    expect(next.photos).toEqual([expect.objectContaining({ sourcePhotoId: 'p1', sourceVersion: 'v2', mediaAssetId: 'm1-edit' })]);
  });

  it('removes photos and empty sections that left the folder but remembers their uploads', () => {
    const createId = ids();
    const first = planApplePhotosSync({
      document: authorDocument, albums: [], photos: [], createId,
      request: request([
        { id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1'], ['p2', 'v1', 'm2']] },
        { id: 'egypt', title: 'Egypt', photos: [['p3', 'v1', 'm3']] },
      ]),
    });
    const next = planApplePhotosSync({ ...first, createId,
      request: request([{ id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1']] }]) });
    expect(summarize(next.document)).toEqual(['section:Earlier', 'author-media', 'section:Kumano', 'm1']);
    expect(next.summary).toMatchObject({ photosRemoved: 2, sectionsRemoved: 1 });
    expect(next.photos.find((photo) => photo.sourcePhotoId === 'p3')).toMatchObject({ sourcePhotoId: 'p3', sourceVersion: 'v1', mediaAssetId: 'm3' });

    // A draft that missed the removal (author save, crash) is still cleaned up by the next sync.
    const retried = planApplePhotosSync({ ...next, document: first.document, createId,
      request: request([{ id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1']] }]) });
    expect(summarize(retried.document)).toEqual(['section:Earlier', 'author-media', 'section:Kumano', 'm1']);
  });

  it('never takes over an author block that shows the same upload', () => {
    const document: PhotosPageDocument = { schemaVersion: 1, blocks: [{ id: 'mine', type: 'media', mediaAssetId: 'm1', decorative: false }] };
    const createId = ids();
    const first = planApplePhotosSync({ document, albums: [], photos: [], createId,
      request: request([{ id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1']] }]) });
    expect(first.document.blocks.filter((block) => block.type === 'media')).toEqual([document.blocks[0]]);

    const edited = planApplePhotosSync({ ...first, createId,
      request: request([{ id: 'kumano', title: 'Kumano', photos: [['p1', 'v2', 'm1-edit']] }]) });
    expect(edited.document.blocks.find((block) => block.id === 'mine')).toEqual(document.blocks[0]);

    const removed = planApplePhotosSync({ ...edited, createId, request: request([]) });
    expect(removed.document.blocks).toEqual(document.blocks);
  });

  it('keeps the old media when the author already placed the edited upload elsewhere', () => {
    const document: PhotosPageDocument = { schemaVersion: 1, blocks: [] };
    const createId = ids();
    const first = planApplePhotosSync({ document, albums: [], photos: [], createId,
      request: request([{ id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1']] }]) });
    const authorPlaced: PhotosPageDocument = {
      ...first.document,
      blocks: [{ id: 'mine', type: 'media', mediaAssetId: 'm1-edit', decorative: false }, ...first.document.blocks],
    };
    const next = planApplePhotosSync({ ...first, document: authorPlaced, createId,
      request: request([{ id: 'kumano', title: 'Kumano', photos: [['p1', 'v2', 'm1-edit']] }]) });
    expect(summarize(next.document)).toEqual(['m1-edit', 'section:Kumano', 'm1']);
  });

  it('makes an already synced photo the cover once it is tagged, unless the album has one', () => {
    const document: PhotosPageDocument = { schemaVersion: 1, blocks: [] };
    const createId = ids();
    const first = planApplePhotosSync({ document, albums: [], photos: [], createId,
      request: request([{ id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1'], ['p2', 'v1', 'm2']] }]) });
    const tagged = planApplePhotosSync({ ...first, createId,
      request: request([{ id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1'], ['p2', 'v1', 'm2', true]] }]) });
    expect(summarize(tagged.document)).toEqual(['section:Kumano', 'm1', 'm2:cover']);

    const bothTagged = planApplePhotosSync({ ...tagged, createId,
      request: request([{ id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1', true], ['p2', 'v1', 'm2', true]] }]) });
    expect(summarize(bothTagged.document)).toEqual(['section:Kumano', 'm1', 'm2:cover']);
  });

  it('gives the cover to a new cover photo when the old cover leaves the album', () => {
    const document: PhotosPageDocument = { schemaVersion: 1, blocks: [] };
    const createId = ids();
    const first = planApplePhotosSync({ document, albums: [], photos: [], createId,
      request: request([{ id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1', true], ['p2', 'v1', 'm2']] }]) });
    const next = planApplePhotosSync({ ...first, createId,
      request: request([{ id: 'kumano', title: 'Kumano', photos: [['p2', 'v1', 'm2'], ['p3', 'v1', 'm3', true]] }]) });
    expect(summarize(next.document)).toEqual(['section:Kumano', 'm2', 'm3:cover']);
  });

  it('keeps an author-chosen cover and places a photo in two albums only once', () => {
    const document: PhotosPageDocument = { schemaVersion: 1, blocks: [] };
    const createId = ids();
    const first = planApplePhotosSync({ document, albums: [], photos: [], createId,
      request: request([{ id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1']] }]) });
    const withAuthorCover: PhotosPageDocument = {
      ...first.document,
      blocks: first.document.blocks.map((block) => block.type === 'media' ? { ...block, albumRole: 'cover' } : block),
    };
    const next = planApplePhotosSync({ ...first, document: withAuthorCover, createId, request: request([
      { id: 'kumano', title: 'Kumano', photos: [['p1', 'v1', 'm1'], ['p2', 'v1', 'm2', true]] },
      { id: 'best', title: 'Best of', photos: [['p2', 'v1', 'm2'], ['p5', 'v1', 'm5']] },
    ]) });
    expect(summarize(next.document)).toEqual(['section:Kumano', 'm1:cover', 'm2', 'section:Best of', 'm5']);
    expect(next.summary.duplicatePhotoIds).toEqual(['p2']);
  });
});
