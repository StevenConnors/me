import { describe, expect, it } from 'vitest';

import { unwrapFindOneAndUpdate } from '@/lib/db/unwrap-find-one-and-update';

describe('unwrapFindOneAndUpdate', () => {
  const document = { _id: 'record' };

  it('returns a direct document unchanged', () => {
    expect(unwrapFindOneAndUpdate<typeof document>(document)).toBe(document);
  });

  it('returns the document from a result wrapper', () => {
    expect(unwrapFindOneAndUpdate<typeof document>({ value: document, ok: 1 })).toBe(document);
  });

  it('returns null for a direct null result', () => {
    expect(unwrapFindOneAndUpdate<typeof document>(null)).toBeNull();
  });

  it.each([null, undefined])('returns null for a result wrapper with value %s', (value) => {
    expect(unwrapFindOneAndUpdate<typeof document>({ value })).toBeNull();
  });
});
