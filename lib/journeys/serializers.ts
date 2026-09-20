import type { ObjectId } from 'mongodb';

import type { Journey, JourneyRevision } from '@/lib/journeys/schemas';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

function isObjectId(value: unknown): value is ObjectId {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'toHexString' in value &&
      typeof (value as { toHexString?: unknown }).toHexString === 'function',
  );
}

function serializeValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (isObjectId(value)) return value.toHexString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object' && value) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        serializeValue(nestedValue),
      ]),
    );
  }
  return String(value);
}

export type SerializedJourney = JsonObject;
export type SerializedJourneyRevision = JsonObject;

export function serializeJourney(journey: Journey): SerializedJourney {
  return serializeValue(journey) as JsonObject;
}

export function serializeJourneyRevision(
  revision: JourneyRevision,
): SerializedJourneyRevision {
  return serializeValue(revision) as JsonObject;
}
