import { z } from 'zod';

import { CurrencyCodeSchema } from '@/lib/trips/currencies';

/**
 * Trip pages live at the site root (`/india-2026`), so a slug must not shadow a
 * top-level route. Keep in sync with `app/` (a unit test enforces it).
 */
export const RESERVED_TRIP_SLUGS: ReadonlySet<string> = new Set([
  'admin', 'api', 'concepts', 'gallery', 'glass', 'images', 'journey-lab', 'photos', 'stories', 'travel',
]);

export const TripSlugSchema = z.string()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')
  .refine((slug) => !RESERVED_TRIP_SLUGS.has(slug), 'That address is already used by another page');

export const IsoDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), 'Not a real date');

const PersonNameSchema = z.string().trim().min(1).max(40);
const ParticipantIdSchema = z.string().min(1).max(64);

export const ParticipantSchema = z.object({ id: ParticipantIdSchema, name: PersonNameSchema }).strict();
export type Participant = z.infer<typeof ParticipantSchema>;

function hasUniqueNames(names: string[]) {
  return new Set(names.map((name) => name.trim().toLocaleLowerCase())).size === names.length;
}

export const TripRecordSchema = z.object({
  _id: TripSlugSchema,
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1).max(80),
  defaultCurrency: CurrencyCodeSchema,
  participants: z.array(ParticipantSchema).min(2).max(12),
  version: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type TripRecord = z.infer<typeof TripRecordSchema>;

export const CreateTripInputSchema = z.object({
  slug: TripSlugSchema,
  name: z.string().trim().min(1).max(80),
  defaultCurrency: CurrencyCodeSchema,
  participants: z.array(PersonNameSchema).min(2).max(12).refine(hasUniqueNames, 'Each person needs a different name'),
}).strict();
export type CreateTripInput = z.infer<typeof CreateTripInputSchema>;

/** People can be renamed or added; existing ids must all stay so no expense loses its payer. */
export const UpdateTripInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  defaultCurrency: CurrencyCodeSchema,
  participants: z.array(z.object({ id: ParticipantIdSchema.optional(), name: PersonNameSchema }).strict())
    .min(2)
    .max(12)
    .refine((people) => hasUniqueNames(people.map((person) => person.name)), 'Each person needs a different name'),
  expectedVersion: z.number().int().nonnegative(),
}).strict();
export type UpdateTripInput = z.infer<typeof UpdateTripInputSchema>;

export const YenConversionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('same-currency') }).strict(),
  z.object({ kind: z.literal('reference'), rate: z.number().positive(), rateDate: IsoDateSchema, provider: z.literal('ecb') }).strict(),
  z.object({ kind: z.literal('manual'), rate: z.number().positive() }).strict(),
]);
export type YenConversion = z.infer<typeof YenConversionSchema>;

export const ExpenseRecordSchema = z.object({
  _id: z.string().uuid(),
  schemaVersion: z.literal(1),
  tripId: TripSlugSchema,
  description: z.string().trim().min(1).max(120),
  spentOn: IsoDateSchema,
  amountMinor: z.number().int().positive(),
  currency: CurrencyCodeSchema,
  paidBy: ParticipantIdSchema,
  splitAmong: z.array(ParticipantIdSchema).min(1),
  conversion: YenConversionSchema,
  amountJpy: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ExpenseRecord = z.infer<typeof ExpenseRecordSchema>;

export const ExpenseInputSchema = z.object({
  description: z.string().trim().min(1).max(120),
  spentOn: IsoDateSchema,
  amount: z.string().min(1).max(20),
  currency: CurrencyCodeSchema,
  paidBy: ParticipantIdSchema,
  splitAmong: z.array(ParticipantIdSchema).min(1).refine((ids) => new Set(ids).size === ids.length, 'List each person once'),
  manualRate: z.number().positive().finite().max(1_000_000).nullable(),
}).strict();
export type ExpenseInput = z.infer<typeof ExpenseInputSchema>;

export const UpdateExpenseInputSchema = ExpenseInputSchema.extend({ expectedVersion: z.number().int().nonnegative() }).strict();

export const TripViewSchema = z.object({
  slug: TripSlugSchema,
  name: z.string(),
  defaultCurrency: CurrencyCodeSchema,
  participants: z.array(ParticipantSchema),
  version: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export type TripView = z.infer<typeof TripViewSchema>;

export function serializeTrip(trip: TripRecord): TripView {
  return {
    slug: trip._id,
    name: trip.name,
    defaultCurrency: trip.defaultCurrency,
    participants: trip.participants,
    version: trip.version,
    updatedAt: trip.updatedAt.toISOString(),
  };
}

export const ExpenseViewSchema = ExpenseRecordSchema
  .omit({ _id: true, schemaVersion: true, tripId: true, createdAt: true, updatedAt: true })
  .extend({ id: z.string().uuid() });
export type ExpenseView = z.infer<typeof ExpenseViewSchema>;

export function serializeExpense(expense: ExpenseRecord): ExpenseView {
  return {
    id: expense._id,
    description: expense.description,
    spentOn: expense.spentOn,
    amountMinor: expense.amountMinor,
    currency: expense.currency,
    paidBy: expense.paidBy,
    splitAmong: expense.splitAmong,
    conversion: expense.conversion,
    amountJpy: expense.amountJpy,
    version: expense.version,
  };
}
