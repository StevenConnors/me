import 'server-only';

import { randomUUID } from 'node:crypto';
import type { Collection, Db, WithId } from 'mongodb';

import { COLLECTION_NAMES, getDatabase } from '@/lib/db/collections';
import { unwrapFindOneAndUpdate } from '@/lib/db/unwrap-find-one-and-update';
import { parseAmountToMinor, SETTLEMENT_CURRENCY } from '@/lib/trips/currencies';
import { getYenReferenceRate } from '@/lib/trips/fx';
import { toYen } from '@/lib/trips/ledger';
import {
  ExpenseRecordSchema,
  TripRecordSchema,
  type CreateTripInput,
  type ExpenseInput,
  type ExpenseRecord,
  type TripRecord,
  type UpdateTripInput,
  type YenConversion,
} from '@/lib/trips/schemas';

const MAX_EXPENSES_PER_TRIP = 2_000;

export class TripNotFoundError extends Error {
  readonly code = 'TRIP_NOT_FOUND';
  constructor(slug: string) {
    super(`No trip exists at /${slug}`);
  }
}

export class DuplicateTripError extends Error {
  readonly code = 'TRIP_SLUG_TAKEN';
  constructor(slug: string) {
    super(`A trip already uses /${slug}`);
  }
}

export class ExpenseNotFoundError extends Error {
  readonly code = 'EXPENSE_NOT_FOUND';
  constructor() {
    super('That expense no longer exists');
  }
}

export class VersionConflictError extends Error {
  readonly code = 'VERSION_CONFLICT';
  constructor(what: string) {
    super(`This ${what} changed in another tab. Reload to see the latest version.`);
  }
}

export class InvalidTripChangeError extends Error {
  readonly code = 'TRIP_CHANGE_INVALID';
}

export class InvalidExpenseError extends Error {
  readonly code = 'EXPENSE_INVALID';
}

function isDuplicateKeyError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

let expenseIndexReady: Promise<string> | undefined;

export class TripRepository {
  constructor(readonly trips: Collection<TripRecord>, readonly expenses: Collection<ExpenseRecord>) {}

  static async connect(db?: Db): Promise<TripRepository> {
    const database = db ?? (await getDatabase());
    const repository = new TripRepository(
      database.collection<TripRecord>(COLLECTION_NAMES.trips),
      database.collection<ExpenseRecord>(COLLECTION_NAMES.tripExpenses),
    );
    expenseIndexReady ??= repository.expenses.createIndex({ tripId: 1, spentOn: -1, createdAt: -1 });
    await expenseIndexReady.catch((error: unknown) => {
      expenseIndexReady = undefined;
      throw error;
    });
    return repository;
  }

  async listTrips(): Promise<TripRecord[]> {
    const trips = await this.trips.find({}).sort({ createdAt: -1 }).limit(100).toArray();
    return trips.map((trip) => TripRecordSchema.parse(trip));
  }

  async findTrip(slug: string): Promise<TripRecord | null> {
    const trip = await this.trips.findOne({ _id: slug });
    return trip ? TripRecordSchema.parse(trip) : null;
  }

  async getTrip(slug: string): Promise<TripRecord> {
    const trip = await this.findTrip(slug);
    if (!trip) throw new TripNotFoundError(slug);
    return trip;
  }

  async createTrip(input: CreateTripInput, now = new Date()): Promise<TripRecord> {
    const trip = TripRecordSchema.parse({
      _id: input.slug,
      schemaVersion: 1,
      name: input.name,
      defaultCurrency: input.defaultCurrency,
      participants: input.participants.map((name) => ({ id: randomUUID(), name })),
      version: 0,
      createdAt: now,
      updatedAt: now,
    });
    try {
      await this.trips.insertOne(trip);
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new DuplicateTripError(input.slug);
      throw error;
    }
    return trip;
  }

  async updateTrip(slug: string, input: UpdateTripInput, now = new Date()): Promise<TripRecord> {
    const current = await this.getTrip(slug);
    if (current.version !== input.expectedVersion) throw new VersionConflictError('trip');
    const submittedIdList = input.participants.flatMap((person) => (person.id ? [person.id] : []));
    const submittedIds = new Set(submittedIdList);
    const knownIds = new Set(current.participants.map((person) => person.id));
    if (submittedIds.size !== submittedIdList.length || submittedIdList.some((id) => !knownIds.has(id))) throw new InvalidTripChangeError('A person in this change is not on the trip');
    if (current.participants.some((person) => !submittedIds.has(person.id))) {
      throw new InvalidTripChangeError('People already on the trip can be renamed but not removed');
    }
    const participants = input.participants.map((person) => ({ id: person.id ?? randomUUID(), name: person.name }));
    const raw = await this.trips.findOneAndUpdate(
      { _id: slug, version: input.expectedVersion },
      { $set: { name: input.name, defaultCurrency: input.defaultCurrency, participants, updatedAt: now }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    const updated = unwrapFindOneAndUpdate<WithId<TripRecord>>(raw);
    if (!updated) throw new VersionConflictError('trip');
    return TripRecordSchema.parse(updated);
  }

  async listExpenses(slug: string): Promise<ExpenseRecord[]> {
    const expenses = await this.expenses.find({ tripId: slug }).sort({ spentOn: -1, createdAt: -1 }).limit(MAX_EXPENSES_PER_TRIP).toArray();
    return expenses.map((expense) => ExpenseRecordSchema.parse(expense));
  }

  async createExpense(slug: string, input: ExpenseInput, now = new Date()): Promise<ExpenseRecord> {
    const trip = await this.getTrip(slug);
    const expense = ExpenseRecordSchema.parse({
      _id: randomUUID(),
      schemaVersion: 1,
      tripId: trip._id,
      ...(await resolveExpense(trip, input)),
      version: 0,
      createdAt: now,
      updatedAt: now,
    });
    await this.expenses.insertOne(expense);
    return expense;
  }

  async updateExpense(slug: string, expenseId: string, input: ExpenseInput & { expectedVersion: number }, now = new Date()): Promise<ExpenseRecord> {
    const trip = await this.getTrip(slug);
    const resolved = await resolveExpense(trip, input);
    const raw = await this.expenses.findOneAndUpdate(
      { _id: expenseId, tripId: slug, version: input.expectedVersion },
      { $set: { ...resolved, updatedAt: now }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    const updated = unwrapFindOneAndUpdate<WithId<ExpenseRecord>>(raw);
    if (updated) return ExpenseRecordSchema.parse(updated);
    if (await this.expenses.countDocuments({ _id: expenseId, tripId: slug }, { limit: 1 })) throw new VersionConflictError('expense');
    throw new ExpenseNotFoundError();
  }

  async deleteExpense(slug: string, expenseId: string): Promise<void> {
    const result = await this.expenses.deleteOne({ _id: expenseId, tripId: slug });
    if (!result.deletedCount) throw new ExpenseNotFoundError();
  }
}

async function resolveExpense(trip: TripRecord, input: ExpenseInput) {
  const people = new Set(trip.participants.map((person) => person.id));
  if (!people.has(input.paidBy)) throw new InvalidExpenseError('The payer is not on this trip');
  if (input.splitAmong.some((id) => !people.has(id))) throw new InvalidExpenseError('Someone in the split is not on this trip');
  const amountMinor = parseAmountToMinor(input.amount, input.currency);
  let conversion: YenConversion;
  if (input.currency === SETTLEMENT_CURRENCY) conversion = { kind: 'same-currency' };
  else if (input.manualRate !== null) conversion = { kind: 'manual', rate: input.manualRate };
  else conversion = { kind: 'reference', provider: 'ecb', ...(await getYenReferenceRate(input.currency, input.spentOn)) };
  const order = trip.participants.map((person) => person.id);
  return {
    description: input.description,
    spentOn: input.spentOn,
    amountMinor,
    currency: input.currency,
    paidBy: input.paidBy,
    splitAmong: order.filter((id) => input.splitAmong.includes(id)),
    conversion,
    amountJpy: toYen({ amountMinor, currency: input.currency, conversion }),
  };
}

export async function loadTripLedger(slug: string) {
  const repository = await TripRepository.connect();
  const [trip, expenses] = await Promise.all([repository.findTrip(slug), repository.listExpenses(slug)]);
  return trip ? { trip, expenses } : null;
}
