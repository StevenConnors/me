import type { Collection } from 'mongodb';
import { ObjectId } from 'mongodb';

import { getApplePhotosImportCollection } from '@/lib/db/collections';
import { MediaRepository } from '@/lib/media/repository';
import {
  PhotosPageConflictError,
  PhotosPageNotFoundError,
  PhotosPageRepository,
} from '@/lib/photos/repository';
import { PhotosPageDocumentSchema } from '@/lib/photos/schemas';

import { planApplePhotosSync, type ApplePhotosSyncSummary } from './plan';
import {
  ApplePhotosImportStateSchema,
  type ApplePhotosImportState,
  type ApplePhotosSyncRequest,
} from './schemas';

const STATE_ID = 'apple-photos';
const MAX_CONFLICT_ATTEMPTS = 3;

export class ApplePhotosMediaUnavailableError extends Error {
  constructor(readonly mediaAssetIds: string[]) {
    super('Some synced photos are not ready images in the media library');
    this.name = 'ApplePhotosMediaUnavailableError';
  }
}

export class ApplePhotosDraftInvalidError extends Error {
  constructor(readonly issues: string[]) {
    super('The synced albums do not fit on the Photos page');
    this.name = 'ApplePhotosDraftInvalidError';
  }
}

export class ApplePhotosImportService {
  constructor(
    readonly imports: Pick<Collection<ApplePhotosImportState>, 'findOne' | 'updateOne'>,
    readonly photosPages: Pick<PhotosPageRepository, 'get' | 'updateDraft'>,
    readonly media: Pick<MediaRepository, 'findByIds'>,
    readonly createId: () => string = () => new ObjectId().toHexString(),
  ) {}

  static async connect(): Promise<ApplePhotosImportService> {
    const [imports, photosPages, media] = await Promise.all([
      getApplePhotosImportCollection(),
      PhotosPageRepository.connect(),
      MediaRepository.connect(),
    ]);
    return new ApplePhotosImportService(imports, photosPages, media);
  }

  /** Uploads the script can reuse; deleted or broken media is left out so it is uploaded again. */
  async manifest() {
    const photos = (await this.loadState())?.photos ?? [];
    const ready = await this.readyMediaIds(photos.map((photo) => photo.mediaAssetId));
    return {
      photos: photos
        .filter((photo) => ready.has(photo.mediaAssetId))
        .map(({ sourcePhotoId, sourceVersion, mediaAssetId }) => ({ sourcePhotoId, sourceVersion, mediaAssetId })),
    };
  }

  async sync(
    request: ApplePhotosSyncRequest,
    options: { now?: Date } = {},
  ): Promise<ApplePhotosSyncSummary & { draftVersion: number; draftChanged: boolean }> {
    await this.assertMediaReady(request);

    for (let attempt = 1; ; attempt += 1) {
      const page = await this.photosPages.get();
      if (!page) throw new PhotosPageNotFoundError();
      const state = await this.loadState();
      const plan = planApplePhotosSync({
        document: page.draftDocument,
        albums: state?.albums ?? [],
        photos: state?.photos ?? [],
        request,
        createId: this.createId,
      });
      const parsed = PhotosPageDocumentSchema.safeParse(plan.document);
      if (!parsed.success) throw new ApplePhotosDraftInvalidError(parsed.error.issues.map((issue) => issue.message));

      // Record block IDs before the draft write so a crash between the two
      // writes is repaired by the next sync instead of duplicating sections.
      // Cover tags are only marked as seen once the draft has them.
      const now = options.now ?? new Date();
      const seenCovers = new Set((state?.photos ?? []).filter((photo) => photo.cover).map((photo) => photo.sourcePhotoId));
      const pendingPhotos = plan.photos.map(({ cover: _cover, ...photo }) => (
        seenCovers.has(photo.sourcePhotoId) ? { ...photo, cover: true } : photo
      ));
      await this.saveState(plan.albums, pendingPhotos, now);

      if (JSON.stringify(parsed.data) === JSON.stringify(page.draftDocument)) {
        await this.saveState(plan.albums, plan.photos, now);
        return { ...plan.summary, draftVersion: page.draftVersion, draftChanged: false };
      }
      try {
        const updated = await this.photosPages.updateDraft(page.draftVersion, parsed.data, { now });
        await this.saveState(plan.albums, plan.photos, now);
        return { ...plan.summary, draftVersion: updated.draftVersion, draftChanged: true };
      } catch (error) {
        if (!(error instanceof PhotosPageConflictError) || attempt >= MAX_CONFLICT_ATTEMPTS) throw error;
      }
    }
  }

  private async saveState(albums: ApplePhotosImportState['albums'], photos: ApplePhotosImportState['photos'], now: Date) {
    await this.imports.updateOne(
      { _id: STATE_ID },
      { $set: { schemaVersion: 1, albums, photos, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
  }

  private async loadState(): Promise<ApplePhotosImportState | null> {
    const raw = await this.imports.findOne({ _id: STATE_ID });
    return raw ? ApplePhotosImportStateSchema.parse(raw) : null;
  }

  private async assertMediaReady(request: ApplePhotosSyncRequest) {
    const ids = Array.from(new Set(request.albums.flatMap((album) => album.photos.map((photo) => photo.mediaAssetId))));
    const ready = await this.readyMediaIds(ids);
    const unavailable = ids.filter((id) => !ready.has(id));
    if (unavailable.length) throw new ApplePhotosMediaUnavailableError(unavailable);
  }

  private async readyMediaIds(ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    return new Set((await this.media.findByIds(Array.from(new Set(ids))))
      .filter((asset) => asset.status === 'ready' && asset.resourceType === 'image')
      .map((asset) => asset._id));
  }
}
