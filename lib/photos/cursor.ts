import 'server-only';

import { z } from 'zod';

import { MediaIdSchema } from '@/lib/media/schemas';

const GalleryCursorSchema = z.object({
  version: z.literal(1),
  publishedAt: z.string().datetime(),
  mediaAssetId: MediaIdSchema,
}).strict();

export type GalleryCursor = z.infer<typeof GalleryCursorSchema>;

export class InvalidGalleryCursorError extends Error {
  readonly code = 'INVALID_GALLERY_CURSOR';
  constructor() {
    super('The gallery cursor is invalid or no longer current');
    this.name = 'InvalidGalleryCursorError';
  }
}

export class StaleGalleryCursorError extends Error {
  readonly code = 'GALLERY_CURSOR_STALE';
  constructor() {
    super('The gallery changed after this cursor was created');
    this.name = 'StaleGalleryCursorError';
  }
}

export function encodeGalleryCursor(cursor: GalleryCursor): string {
  return Buffer.from(JSON.stringify(GalleryCursorSchema.parse(cursor))).toString('base64url');
}

export function decodeGalleryCursor(value: string): GalleryCursor {
  if (!value || value.length > 1_024) throw new InvalidGalleryCursorError();
  try {
    return GalleryCursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw new InvalidGalleryCursorError();
  }
}
