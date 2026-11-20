import 'server-only';

import type { Collection, UpdateFilter, WithId } from 'mongodb';

import { getDatabase } from '@/lib/db/collections';
import { unwrapFindOneAndUpdate } from '@/lib/db/unwrap-find-one-and-update';
import { EMPTY_TRAVEL_SELECTIONS, type TravelSelections } from '@/lib/travel/catalog';
import { emptyTravelRecord, TravelRecordSchema, type TravelRecord } from '@/lib/travel/schema';

export class TravelVersionConflictError extends Error {
  readonly code = 'TRAVEL_VERSION_CONFLICT';

  constructor(readonly expectedVersion: number, readonly currentVersion: number) {
    super(`Travel locations changed since version ${expectedVersion}; current version is ${currentVersion}`);
    this.name = 'TravelVersionConflictError';
  }
}

export class TravelRepository {
  constructor(readonly records: Collection<TravelRecord>) {}

  static async connect(): Promise<TravelRepository> {
    const database = await getDatabase();
    return new TravelRepository(database.collection<TravelRecord>('travel'));
  }

  async get(): Promise<{ selections: TravelSelections; version: number; updatedAt: string | null }> {
    const record = await this.records.findOne({ _id: 'travel' });
    if (!record) return { selections: { ...EMPTY_TRAVEL_SELECTIONS }, version: 0, updatedAt: null };
    const parsed = TravelRecordSchema.parse(record);
    return {
      selections: parsed.selections,
      version: parsed.version,
      updatedAt: parsed.updatedAt?.toISOString() ?? null,
    };
  }

  async update(selections: TravelSelections, expectedVersion: number, now = new Date()) {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new RangeError('expectedVersion must be a non-negative integer');
    }
    const initial = emptyTravelRecord();
    try {
      await this.records.updateOne(
        { _id: 'travel' },
        { $setOnInsert: initial } as UpdateFilter<TravelRecord>,
        { upsert: true },
      );
    } catch (error) {
      // Two first-time saves can race to create the singleton; the unique _id
      // makes one insert win, after which both requests contend on its version.
      if (!(typeof error === 'object' && error && 'code' in error && (error as { code?: unknown }).code === 11000)) throw error;
    }
    const raw = await this.records.findOneAndUpdate(
      { _id: 'travel', version: expectedVersion },
      {
        $set: { selections, updatedAt: now },
        $inc: { version: 1 },
      } as UpdateFilter<TravelRecord>,
      { returnDocument: 'after' },
    );
    const updated = unwrapFindOneAndUpdate<WithId<TravelRecord>>(raw);
    if (updated) {
      const parsed = TravelRecordSchema.parse(updated);
      return { selections: parsed.selections, version: parsed.version, updatedAt: parsed.updatedAt?.toISOString() ?? null };
    }
    const current = await this.records.findOne({ _id: 'travel' });
    throw new TravelVersionConflictError(expectedVersion, current?.version ?? 0);
  }
}

export async function getTravel() {
  return TravelRepository.connect().then((repository) => repository.get());
}
