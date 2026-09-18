import type { Collection } from 'mongodb';
import { describe, expect, it } from 'vitest';

import { MediaRepository } from '@/lib/media/repository';
import type { ProviderAsset } from '@/lib/media/providers/MediaProvider';
import type { MediaAsset, UploadSession } from '@/lib/media/schemas';

class MemoryMediaAssets {
  records: MediaAsset[] = [];

  async findOne(filter: Partial<MediaAsset>) {
    return this.records.find((record) => Object.entries(filter).every(([key, value]) => record[key as keyof MediaAsset] === value)) ?? null;
  }

  async findOneAndUpdate(
    filter: Partial<MediaAsset>,
    update: { $setOnInsert?: MediaAsset; $set?: Partial<MediaAsset> },
    options: { upsert?: boolean },
  ) {
    const existing = await this.findOne(filter);
    if (existing) {
      if (update.$set) Object.assign(existing, update.$set);
      return { value: existing };
    }
    if (options.upsert && update.$setOnInsert) {
      this.records.push(update.$setOnInsert);
      return { value: update.$setOnInsert };
    }
    return { value: null };
  }
}

class MemoryUploadSessions {
  records: UploadSession[] = [];

  async findOne(filter: Partial<UploadSession>) {
    return this.records.find((record) => Object.entries(filter).every(([key, value]) => record[key as keyof UploadSession] === value)) ?? null;
  }

  async insertOne(record: UploadSession) {
    this.records.push(record);
    return { acknowledged: true };
  }

  async updateOne(filter: Partial<UploadSession>, update: { $set: Partial<UploadSession> }) {
    const record = await this.findOne(filter);
    if (record) Object.assign(record, update.$set);
    return { acknowledged: true, matchedCount: record ? 1 : 0 };
  }
}

const providerAsset: ProviderAsset = {
  providerAssetId: 'cloudinary-asset-id',
  providerPublicId: 'journey-editor/photo',
  resourceType: 'image',
  deliveryType: 'upload',
  version: 1,
  originalFilename: 'photo.jpg',
  format: 'jpg',
  width: 1600,
  height: 1200,
  bytes: 230_000,
  checksum: 'checksum',
  tags: [],
};

describe('MediaRepository', () => {
  it('reuses a finalized media record when finalization is retried', async () => {
    const media = new MemoryMediaAssets();
    const sessions = new MemoryUploadSessions();
    const repository = new MediaRepository(
      media as unknown as Collection<MediaAsset>,
      sessions as unknown as Collection<UploadSession>,
    );
    const key = 'valid_upload_key';

    await repository.createOrReuseUploadSession({
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      bytes: 230_000,
      idempotencyKey: key,
    });
    const first = await repository.finalizeUpload(key, providerAsset);
    const retried = await repository.finalizeUpload(key, providerAsset);

    expect(retried._id).toBe(first._id);
    expect(media.records).toHaveLength(1);
    expect(sessions.records[0]).toMatchObject({
      status: 'finalized',
      mediaAssetId: first._id,
    });
  });
});
