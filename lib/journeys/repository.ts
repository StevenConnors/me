import {
  ObjectId,
  type ClientSession,
  type Collection,
  type Filter,
  type UpdateFilter,
  type WithId,
} from 'mongodb';

import { getJourneyCollections } from '@/lib/db/collections';
import {
  CreateJourneyInputSchema,
  EMPTY_JOURNEY_DOCUMENT,
  JourneyDraftPatchSchema,
  JourneySchema,
  type CreateJourneyInput,
  type Journey,
  type JourneyDraftPatch,
  type JourneyRevision,
  type JourneyStatus,
} from '@/lib/journeys/schemas';

export class JourneyNotFoundError extends Error {
  readonly code = 'JOURNEY_NOT_FOUND';

  constructor(readonly journeyId: string) {
    super(`Journey ${journeyId} was not found`);
    this.name = 'JourneyNotFoundError';
  }
}

export class JourneyConflictError extends Error {
  readonly code = 'JOURNEY_EDIT_CONFLICT';

  constructor(
    readonly expectedEditVersion: number,
    readonly currentEditVersion: number,
  ) {
    super(
      `Journey changed since version ${expectedEditVersion}; current version is ${currentEditVersion}`,
    );
    this.name = 'JourneyConflictError';
  }
}

export class InvalidJourneyIdError extends Error {
  readonly code = 'INVALID_JOURNEY_ID';

  constructor(readonly value: string) {
    super(`Invalid journey ID: ${value}`);
    this.name = 'InvalidJourneyIdError';
  }
}

export function toJourneyObjectId(id: string | ObjectId): ObjectId {
  if (id instanceof ObjectId) return id;
  if (!ObjectId.isValid(id)) throw new InvalidJourneyIdError(id);
  return new ObjectId(id);
}

export function makeUntitledSlug(id: ObjectId): string {
  return `untitled-${id.toHexString().slice(-8)}`;
}

function unwrapFindOneAndUpdate<T>(result: unknown): T | null {
  if (result === null) return null;
  if (typeof result === 'object' && result && 'value' in result) {
    return ((result as { value?: T | null }).value ?? null) as T | null;
  }
  return result as T;
}

export class JourneyRepository {
  constructor(
    readonly journeys: Collection<Journey>,
    readonly revisions?: Collection<JourneyRevision>,
  ) {}

  static async connect(): Promise<JourneyRepository> {
    const { journeys, revisions } = await getJourneyCollections();
    return new JourneyRepository(journeys, revisions);
  }

  async create(
    input: CreateJourneyInput,
    options: { now?: Date; session?: ClientSession } = {},
  ): Promise<Journey> {
    const parsed = CreateJourneyInputSchema.parse(input);
    const now = options.now ?? new Date();
    const id = new ObjectId();
    const journey = JourneySchema.parse({
      _id: id,
      schemaVersion: 1,
      slug: parsed.slug ?? makeUntitledSlug(id),
      title: parsed.title,
      status: 'draft',
      draftDocument: EMPTY_JOURNEY_DOCUMENT,
      locations: [],
      editVersion: 0,
      createdAt: now,
      updatedAt: now,
    });

    await this.journeys.insertOne(journey, { session: options.session });
    return journey;
  }

  async findById(
    id: string | ObjectId,
    options: { session?: ClientSession } = {},
  ): Promise<Journey | null> {
    const result = await this.journeys.findOne(
      { _id: toJourneyObjectId(id) },
      { session: options.session },
    );
    return result ? JourneySchema.parse(result) : null;
  }

  async findBySlug(
    slug: string,
    options: { includeArchived?: boolean; session?: ClientSession } = {},
  ): Promise<Journey | null> {
    const filter: Filter<Journey> = { slug };
    if (!options.includeArchived) filter.status = { $ne: 'archived' };
    const result = await this.journeys.findOne(filter, {
      session: options.session,
    });
    return result ? JourneySchema.parse(result) : null;
  }

  async list(
    options: {
      status?: JourneyStatus;
      query?: string;
      limit?: number;
      session?: ClientSession;
    } = {},
  ): Promise<Journey[]> {
    const filters: Filter<Journey>[] = [];
    if (options.status) filters.push({ status: options.status });

    const query = options.query?.trim();
    if (query) {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = new RegExp(escaped, 'i');
      filters.push({ $or: [{ title: match }, { slug: match }, { summary: match }] } as Filter<Journey>);
    }

    const filter: Filter<Journey> =
      filters.length === 0 ? {} : filters.length === 1 ? filters[0] : { $and: filters } as Filter<Journey>;

    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const journeys = await this.journeys
      .find(filter, { session: options.session })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();

    return journeys.map((journey) => JourneySchema.parse(journey));
  }

  /**
   * A media record must stay available while any draft or immutable published
   * revision points to it. MongoDB applies dotted paths through Tiptap's node
   * arrays, so this covers photograph, gallery, and story-step placements.
   */
  async isMediaReferenced(mediaId: string): Promise<boolean> {
    const draftReference = {
      $or: [
        { 'cover.mediaAssetId': mediaId },
        { 'social.image.mediaAssetId': mediaId },
        { 'draftDocument.content.content.attrs.placement.mediaAssetId': mediaId },
        { 'draftDocument.content.content.attrs.items.mediaAssetId': mediaId },
        { 'draftDocument.content.content.attrs.media.mediaAssetId': mediaId },
      ],
    } as Filter<Journey>;
    const draft = await this.journeys.findOne(draftReference, { projection: { _id: 1 } });
    if (draft) return true;
    if (!this.revisions) return false;

    const revisionReference = {
      $or: [
        { 'metadataSnapshot.cover.mediaAssetId': mediaId },
        { 'metadataSnapshot.social.image.mediaAssetId': mediaId },
        { 'document.content.content.attrs.placement.mediaAssetId': mediaId },
        { 'document.content.content.attrs.items.mediaAssetId': mediaId },
        { 'document.content.content.attrs.media.mediaAssetId': mediaId },
      ],
    } as Filter<JourneyRevision>;
    return Boolean(await this.revisions.findOne(revisionReference, { projection: { _id: 1 } }));
  }

  /**
   * Permanently removes a journey and its immutable revision history. Media
   * assets are deliberately retained because they can be shared by journeys.
   */
  async deleteById(
    id: string | ObjectId,
    options: { session?: ClientSession } = {},
  ): Promise<void> {
    const journeyId = toJourneyObjectId(id);
    const result = await this.journeys.deleteOne({ _id: journeyId }, { session: options.session });
    if (!result.deletedCount) throw new JourneyNotFoundError(journeyId.toHexString());
    if (this.revisions) {
      await this.revisions.deleteMany({ journeyId }, { session: options.session });
    }
  }

  async updateDraft(
    id: string | ObjectId,
    expectedEditVersion: number,
    input: JourneyDraftPatch,
    options: { now?: Date; session?: ClientSession } = {},
  ): Promise<Journey> {
    if (!Number.isInteger(expectedEditVersion) || expectedEditVersion < 0) {
      throw new RangeError('expectedEditVersion must be a non-negative integer');
    }

    const patch = JourneyDraftPatchSchema.parse(input);
    const journeyId = toJourneyObjectId(id);
    const now = options.now ?? new Date();
    const set: Record<string, unknown> = { updatedAt: now };
    const unset: Record<string, ''> = {};

    for (const [key, value] of Object.entries(patch)) {
      if (value === null) unset[key] = '';
      else set[key] = value;
    }

    const update = {
      $set: set,
      $inc: { editVersion: 1 },
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    } as UpdateFilter<Journey>;

    const rawResult = await this.journeys.findOneAndUpdate(
      { _id: journeyId, editVersion: expectedEditVersion },
      update,
      { returnDocument: 'after', session: options.session },
    );
    const updated = unwrapFindOneAndUpdate<WithId<Journey>>(rawResult);

    if (updated) return JourneySchema.parse(updated);

    const current = await this.journeys.findOne(
      { _id: journeyId },
      { projection: { editVersion: 1 }, session: options.session },
    );
    if (!current) throw new JourneyNotFoundError(journeyId.toHexString());
    throw new JourneyConflictError(expectedEditVersion, current.editVersion);
  }

  async setStatus(
    id: string | ObjectId,
    status: JourneyStatus,
    options: { now?: Date; session?: ClientSession } = {},
  ): Promise<Journey> {
    const journeyId = toJourneyObjectId(id);
    const now = options.now ?? new Date();
    const set: Record<string, unknown> = { status, updatedAt: now };
    const unset: Record<string, ''> = {};

    if (status === 'archived') set.archivedAt = now;
    else unset.archivedAt = '';

    if (status !== 'published') {
      unset.publishedRevisionId = '';
      unset.publishedAt = '';
    }

    const rawResult = await this.journeys.findOneAndUpdate(
      { _id: journeyId },
      { $set: set, $unset: unset } as UpdateFilter<Journey>,
      { returnDocument: 'after', session: options.session },
    );
    const updated = unwrapFindOneAndUpdate<WithId<Journey>>(rawResult);
    if (!updated) throw new JourneyNotFoundError(journeyId.toHexString());
    return JourneySchema.parse(updated);
  }

  /**
   * Points the public journey at an immutable revision. The revision itself is
   * created by the publishing service after publication validation succeeds.
   */
  async publish(
    id: string | ObjectId,
    expectedEditVersion: number,
    publishedRevisionId: string | ObjectId,
    options: { now?: Date; session?: ClientSession } = {},
  ): Promise<Journey> {
    const current = await this.findById(id, { session: options.session });
    if (!current) throw new JourneyNotFoundError(String(id));
    if (current.editVersion !== expectedEditVersion) {
      throw new JourneyConflictError(expectedEditVersion, current.editVersion);
    }

    const now = options.now ?? new Date();
    const rawResult = await this.journeys.findOneAndUpdate(
      { _id: current._id, editVersion: expectedEditVersion },
      {
        $set: {
          status: 'published',
          publishedRevisionId: toJourneyObjectId(publishedRevisionId),
          publishedAt: now,
          firstPublishedAt: current.firstPublishedAt ?? now,
          updatedAt: now,
        },
      } as UpdateFilter<Journey>,
      { returnDocument: 'after', session: options.session },
    );
    const published = unwrapFindOneAndUpdate<WithId<Journey>>(rawResult);
    if (published) return JourneySchema.parse(published);

    const latest = await this.findById(id, { session: options.session });
    if (!latest) throw new JourneyNotFoundError(String(id));
    throw new JourneyConflictError(expectedEditVersion, latest.editVersion);
  }
}
