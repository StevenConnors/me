import { describe, expect, it } from 'vitest';

import { planMediaDeletion } from '@/lib/media/bulk-delete-service';
import type { MediaAsset } from '@/lib/media/schemas';

const media = (id: string): MediaAsset => ({
  _id: id,
  schemaVersion: 1,
  provider: 'cloudinary',
  providerAssetId: `provider-${id}`,
  providerPublicId: `photos/${id}`,
  resourceType: 'image',
  deliveryType: 'upload',
  originalFilename: `${id}.jpg`,
  format: 'jpg',
  width: 1200,
  height: 800,
  bytes: 100,
  tags: [],
  showInPhotos: false,
  status: 'ready',
  createdAt: new Date('2026-09-21T00:00:00.000Z'),
  updatedAt: new Date('2026-09-21T00:00:00.000Z'),
});

describe('planMediaDeletion', () => {
  it('classifies every selected upload before a destructive request', async () => {
    const records = new Map(['ready', 'published', 'journey'].map((id) => [id, media(id)]));
    const plan = await planMediaDeletion(['ready', 'published', 'journey', 'gone'], {
      mediaRepository: { findById: async (id) => records.get(id) ?? null },
      photosPageRepository: { isMediaReferencedByPublishedDocument: async (id) => id === 'published' },
      journeyRepository: { isMediaReferenced: async (id) => id === 'journey' },
    });

    expect(plan).toEqual([
      { id: 'ready', filename: 'ready.jpg', classification: 'ready_to_delete' },
      { id: 'published', filename: 'published.jpg', classification: 'publish_removal_first' },
      { id: 'journey', filename: 'journey.jpg', classification: 'used_by_journey' },
      { id: 'gone', filename: 'Unknown upload', classification: 'not_found' },
    ]);
  });
});
