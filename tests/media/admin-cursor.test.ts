import { describe, expect, it } from 'vitest';

import {
  decodeAdminMediaCursor,
  encodeAdminMediaCursor,
  InvalidAdminMediaCursorError,
} from '@/lib/media/admin-cursor';

describe('admin media cursor', () => {
  it('round-trips a bounded, versioned cursor', () => {
    const cursor = encodeAdminMediaCursor({
      version: 1,
      createdAt: '2026-09-21T00:00:00.000Z',
      id: 'media-123',
    });
    expect(decodeAdminMediaCursor(cursor)).toEqual({
      version: 1,
      createdAt: '2026-09-21T00:00:00.000Z',
      id: 'media-123',
    });
  });

  it('rejects malformed, oversized, and unsupported cursor data', () => {
    expect(() => decodeAdminMediaCursor('not-json')).toThrow(InvalidAdminMediaCursorError);
    expect(() => decodeAdminMediaCursor('x'.repeat(1_025))).toThrow(InvalidAdminMediaCursorError);
    const unsupported = Buffer.from(JSON.stringify({ version: 2, createdAt: '2026-09-21T00:00:00.000Z', id: 'x' })).toString('base64url');
    expect(() => decodeAdminMediaCursor(unsupported)).toThrow(InvalidAdminMediaCursorError);
  });
});
