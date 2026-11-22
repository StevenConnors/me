import 'server-only';

import { ZodError } from 'zod';

import { apiError } from '@/lib/http/admin-api';
import { InvalidAmountError } from '@/lib/trips/currencies';
import { YenRateUnavailableError } from '@/lib/trips/fx';
import {
  ExpenseNotFoundError,
  InvalidExpenseError,
  InvalidTripChangeError,
  TripNotFoundError,
  VersionConflictError,
} from '@/lib/trips/repository';
import { TripIdSchema } from '@/lib/trips/schemas';

/** A malformed trip link is just a link that does not exist. */
export function parseTripIdParam(value: string): string {
  const parsed = TripIdSchema.safeParse(value);
  if (!parsed.success) throw new TripNotFoundError();
  return parsed.data;
}

export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: apiError('INVALID_JSON', 'Request body must be valid JSON', 400) };
  }
}

export function tripErrorResponse(error: unknown, action: string) {
  if (error instanceof ZodError) return apiError('TRIP_REQUEST_INVALID', error.issues[0]?.message ?? 'The request is invalid', 400, error.issues);
  if (error instanceof InvalidAmountError || error instanceof InvalidExpenseError || error instanceof InvalidTripChangeError) {
    return apiError(error.code, error.message, 400);
  }
  if (error instanceof TripNotFoundError || error instanceof ExpenseNotFoundError) return apiError(error.code, error.message, 404);
  if (error instanceof VersionConflictError) return apiError(error.code, error.message, 409);
  if (error instanceof YenRateUnavailableError) return apiError(error.code, error.message, 422);
  console.error(`Unable to ${action}`, error);
  return apiError('TRIP_STORAGE_FAILED', `Unable to ${action} right now`, 503);
}
