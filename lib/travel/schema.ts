import { z } from 'zod';

import {
  EMPTY_TRAVEL_SELECTIONS,
  TRAVEL_PLACES,
  type TravelRegion,
  type TravelSelections,
} from '@/lib/travel/catalog';

export const TravelSelectionsSchema = z.object({
  countries: z.array(z.string()).max(249),
  usStates: z.array(z.string()).max(50),
  japanPrefectures: z.array(z.string()).max(47),
}).strict();

export const TravelRecordSchema = z.object({
  _id: z.literal('travel'),
  schemaVersion: z.literal(1),
  selections: TravelSelectionsSchema,
  version: z.number().int().nonnegative(),
  updatedAt: z.date().nullable(),
});

export type TravelRecord = z.infer<typeof TravelRecordSchema>;

export class InvalidTravelSelectionsError extends Error {
  readonly code = 'TRAVEL_SELECTIONS_INVALID';

  constructor(readonly invalid: Partial<Record<TravelRegion, string[]>>) {
    super('Travel selections include unknown place codes');
    this.name = 'InvalidTravelSelectionsError';
  }
}

export function normalizeTravelSelections(input: unknown): TravelSelections {
  const parsed = TravelSelectionsSchema.parse(input);
  const invalid: Partial<Record<TravelRegion, string[]>> = {};
  const selections = { ...EMPTY_TRAVEL_SELECTIONS } as TravelSelections;
  for (const region of Object.keys(TRAVEL_PLACES) as TravelRegion[]) {
    const known = new Set(TRAVEL_PLACES[region].map((place) => place.code));
    const unknown = Array.from(new Set(parsed[region].filter((code) => !known.has(code))));
    if (unknown.length) invalid[region] = unknown;
    const selected = new Set(parsed[region]);
    selections[region] = TRAVEL_PLACES[region].filter((place) => selected.has(place.code)).map((place) => place.code);
  }
  if (Object.keys(invalid).length) throw new InvalidTravelSelectionsError(invalid);
  return selections;
}

export function emptyTravelRecord(): TravelRecord {
  return {
    _id: 'travel',
    schemaVersion: 1,
    selections: { ...EMPTY_TRAVEL_SELECTIONS },
    version: 0,
    updatedAt: null,
  };
}
