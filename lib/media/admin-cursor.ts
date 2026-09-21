import 'server-only';

import { z } from 'zod';

const AdminMediaCursorSchema = z.object({
  version: z.literal(1),
  createdAt: z.string().datetime(),
  id: z.string().trim().min(1).max(128),
}).strict();

export type AdminMediaCursor = z.infer<typeof AdminMediaCursorSchema>;

export class InvalidAdminMediaCursorError extends Error {
  readonly code = 'INVALID_MEDIA_CURSOR';
  constructor() {
    super('The media cursor is invalid');
    this.name = 'InvalidAdminMediaCursorError';
  }
}

export function encodeAdminMediaCursor(cursor: AdminMediaCursor): string {
  return Buffer.from(JSON.stringify(AdminMediaCursorSchema.parse(cursor))).toString('base64url');
}

export function decodeAdminMediaCursor(value: string): AdminMediaCursor {
  if (!value || value.length > 1_024) throw new InvalidAdminMediaCursorError();
  try {
    return AdminMediaCursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw new InvalidAdminMediaCursorError();
  }
}
