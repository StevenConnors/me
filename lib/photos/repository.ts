import 'server-only';

import type { Collection, Filter, UpdateFilter, WithId } from 'mongodb';

import { getPhotosCollections } from '@/lib/db/collections';
import {
  EmptyPhotosPageDocument,
  PhotosPageDocumentSchema,
  PhotosPageSchema,
  validatePhotosDocumentForPublishing,
  type PhotosPage,
  type PhotosPageDocument,
  type PhotosPublishIssue,
} from '@/lib/photos/schemas';
import type { MediaAsset } from '@/lib/media/schemas';

function unwrapFindOneAndUpdate<T>(result: unknown): T | null {
  if (result === null) return null;
  if (typeof result === 'object' && result && 'value' in result) {
    return ((result as { value?: T | null }).value ?? null) as T | null;
  }
  return result as T;
}

export class PhotosPageNotFoundError extends Error {
  readonly code = 'PHOTOS_PAGE_NOT_FOUND';

  constructor() {
    super('The Photos page has not been initialized');
    this.name = 'PhotosPageNotFoundError';
  }
}

export class PhotosPageConflictError extends Error {
  readonly code = 'PHOTOS_DRAFT_CONFLICT';

  constructor(
    readonly expectedDraftVersion: number,
    readonly currentDraftVersion: number,
  ) {
    super(
      `Photos draft changed since version ${expectedDraftVersion}; current version is ${currentDraftVersion}`,
    );
    this.name = 'PhotosPageConflictError';
  }
}

export class PhotosPublishValidationError extends Error {
  readonly code = 'PHOTOS_PUBLISH_INVALID';

  constructor(readonly issues: PhotosPublishIssue[]) {
    super('The Photos draft cannot be published yet');
    this.name = 'PhotosPublishValidationError';
  }
}

function assertExpectedVersion(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError('expectedVersion must be a non-negative integer');
  }
}

export class PhotosPageRepository {
  constructor(
    readonly photosPages: Collection<PhotosPage>,
    readonly mediaAssets?: Collection<MediaAsset>,
  ) {}

  static async connect(): Promise<PhotosPageRepository> {
    const { photosPages, mediaAssets } = await getPhotosCollections();
    return new PhotosPageRepository(photosPages, mediaAssets);
  }

  async get(): Promise<PhotosPage | null> {
    const page = await this.photosPages.findOne({ _id: 'photos' });
    return page ? PhotosPageSchema.parse(page) : null;
  }

  /** Creates the singleton only when it is absent, never overwriting a draft. */
  async createIfMissing(options: {
    draftDocument?: PhotosPageDocument;
    publishedDocument?: PhotosPageDocument;
    now?: Date;
  } = {}): Promise<PhotosPage> {
    const now = options.now ?? new Date();
    const draftDocument = PhotosPageDocumentSchema.parse(
      options.draftDocument ?? EmptyPhotosPageDocument,
    );
    const publishedDocument = options.publishedDocument
      ? PhotosPageDocumentSchema.parse(options.publishedDocument)
      : undefined;
    const newPage = PhotosPageSchema.parse({
      _id: 'photos',
      schemaVersion: 1,
      draftDocument,
      draftVersion: 0,
      ...(publishedDocument ? { publishedDocument } : {}),
      createdAt: now,
      updatedAt: now,
      ...(publishedDocument ? { publishedAt: now } : {}),
    });

    const raw = await this.photosPages.findOneAndUpdate(
      { _id: 'photos' },
      { $setOnInsert: newPage } as UpdateFilter<PhotosPage>,
      { upsert: true, returnDocument: 'after' },
    );
    const page = unwrapFindOneAndUpdate<WithId<PhotosPage>>(raw);
    if (!page) throw new PhotosPageNotFoundError();
    return PhotosPageSchema.parse(page);
  }

  async updateDraft(
    expectedVersion: number,
    input: PhotosPageDocument,
    options: { now?: Date } = {},
  ): Promise<PhotosPage> {
    assertExpectedVersion(expectedVersion);
    const draftDocument = PhotosPageDocumentSchema.parse(input);
    const raw = await this.photosPages.findOneAndUpdate(
      { _id: 'photos', draftVersion: expectedVersion },
      {
        $set: { draftDocument, updatedAt: options.now ?? new Date() },
        $inc: { draftVersion: 1 },
      } as UpdateFilter<PhotosPage>,
      { returnDocument: 'after' },
    );
    const updated = unwrapFindOneAndUpdate<WithId<PhotosPage>>(raw);
    if (updated) return PhotosPageSchema.parse(updated);
    return this.throwMutationFailure(expectedVersion);
  }

  /**
   * Validate the exact persisted draft, then atomically snapshot that same
   * version into the published document. A concurrent save turns into a 409.
   */
  async publish(
    expectedVersion: number,
    options: { now?: Date } = {},
  ): Promise<PhotosPage> {
    assertExpectedVersion(expectedVersion);
    const current = await this.get();
    if (!current) throw new PhotosPageNotFoundError();
    if (current.draftVersion !== expectedVersion) {
      throw new PhotosPageConflictError(expectedVersion, current.draftVersion);
    }

    const issues = await this.getPublishIssues(current.draftDocument);
    if (issues.length) throw new PhotosPublishValidationError(issues);

    const now = options.now ?? new Date();
    const raw = await this.photosPages.findOneAndUpdate(
      { _id: 'photos', draftVersion: expectedVersion },
      [
        {
          $set: {
            publishedDocument: '$draftDocument',
            publishedAt: now,
            updatedAt: now,
            draftVersion: { $add: ['$draftVersion', 1] },
          },
        },
      ] as unknown as UpdateFilter<PhotosPage>,
      { returnDocument: 'after' },
    );
    const published = unwrapFindOneAndUpdate<WithId<PhotosPage>>(raw);
    if (published) return PhotosPageSchema.parse(published);
    return this.throwMutationFailure(expectedVersion);
  }

  async discardDraft(
    expectedVersion: number,
    options: { now?: Date } = {},
  ): Promise<PhotosPage> {
    assertExpectedVersion(expectedVersion);
    const now = options.now ?? new Date();
    const raw = await this.photosPages.findOneAndUpdate(
      { _id: 'photos', draftVersion: expectedVersion, publishedDocument: { $exists: true } } as Filter<PhotosPage>,
      [
        {
          $set: {
            draftDocument: '$publishedDocument',
            updatedAt: now,
            draftVersion: { $add: ['$draftVersion', 1] },
          },
        },
      ] as unknown as UpdateFilter<PhotosPage>,
      { returnDocument: 'after' },
    );
    const discarded = unwrapFindOneAndUpdate<WithId<PhotosPage>>(raw);
    if (discarded) return PhotosPageSchema.parse(discarded);
    return this.throwMutationFailure(expectedVersion);
  }

  async isMediaReferencedByPublishedDocument(mediaId: string): Promise<boolean> {
    return Boolean(
      await this.photosPages.findOne(
        { _id: 'photos', 'publishedDocument.blocks': { $elemMatch: { type: 'media', mediaAssetId: mediaId } } } as Filter<PhotosPage>,
        { projection: { _id: 1 } },
      ),
    );
  }

  private async getPublishIssues(document: PhotosPageDocument): Promise<PhotosPublishIssue[]> {
    const issues = validatePhotosDocumentForPublishing(document);
    if (!this.mediaAssets) return issues;

    const mediaBlocks = document.blocks.filter((block) => block.type === 'media');
    if (!mediaBlocks.length) return issues;
    const assets = await this.mediaAssets
      .find({ _id: { $in: mediaBlocks.map((block) => block.mediaAssetId) } })
      .toArray();
    const assetsById = new Map(assets.map((asset) => [asset._id, asset]));

    mediaBlocks.forEach((block) => {
      const asset = assetsById.get(block.mediaAssetId);
      if (!asset) {
        issues.push({ blockId: block.id, message: 'The referenced media asset is unavailable' });
      } else if (asset.status !== 'ready' || asset.resourceType !== 'image') {
        issues.push({
          blockId: block.id,
          message: 'The referenced media must be a ready image before publishing',
        });
      }
    });
    return issues;
  }

  private async throwMutationFailure(expectedVersion: number): Promise<never> {
    const current = await this.get();
    if (!current) throw new PhotosPageNotFoundError();
    throw new PhotosPageConflictError(expectedVersion, current.draftVersion);
  }
}
