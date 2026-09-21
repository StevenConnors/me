import { describe, expect, it, vi } from 'vitest';

import { loadJourneyEditorMedia } from '@/lib/journeys/editor-media';
import type { HeldPlacesDocumentV2 } from '@/lib/journeys/schemas';
import { MediaAssetSchema } from '@/lib/media/schemas';

function asset(id: string) {
  return MediaAssetSchema.parse({
    _id: id, schemaVersion: 1, provider: 'cloudinary', providerAssetId: `provider-${id}`,
    providerPublicId: `journeys/${id}`, resourceType: 'image', deliveryType: 'upload',
    originalFilename: `${id}.jpg`, format: 'jpg', width: 1800, height: 1200, bytes: 1000,
    tags: [], status: 'ready', createdAt: new Date(), updatedAt: new Date(),
  });
}

describe('Journey editor media loading', () => {
  it('loads older chapter and cover images missing from the newest library page', async () => {
    const recentId = '66e4cc6e7fd5e6ad3db7ba10';
    const chapterId = '66e4cc6e7fd5e6ad3db7ba11';
    const coverId = '66e4cc6e7fd5e6ad3db7ba12';
    const document: HeldPlacesDocumentV2 = {
      schemaVersion: 2, template: 'held-places-v1', chapters: [{
        id: 'chapter-1', body: { type: 'doc', content: [] }, media: [{ mediaAssetId: chapterId }],
      }],
    };
    const repository = {
      list: vi.fn().mockResolvedValue([asset(recentId)]),
      findByIds: vi.fn().mockResolvedValue([asset(chapterId), asset(coverId)]),
    };
    const provider = { buildImageUrl: vi.fn(({ providerPublicId }: { providerPublicId: string }) => `https://images.example/${providerPublicId}`) };
    const result = await loadJourneyEditorMedia({
      draftDocument: document,
      cover: { mediaAssetId: coverId, role: 'cover', layout: { desktop: 'full', mobile: 'full' } },
    }, repository, provider);

    expect(Array.from(repository.findByIds.mock.calls[0][0])).toEqual([coverId, chapterId]);
    expect(result.map(({ id }) => id)).toEqual([recentId, chapterId, coverId]);
    expect(result.find(({ id }) => id === chapterId)?.previewUrl).toBe(`https://images.example/journeys/${chapterId}`);
  });
});
