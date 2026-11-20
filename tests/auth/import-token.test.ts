import { describe, expect, it } from 'vitest';

import { isValidImportToken } from '@/lib/auth/import-token';

const token = 'a'.repeat(31) + 'b';

describe('import token', () => {
  it('accepts only the configured bearer token', () => {
    expect(isValidImportToken(`Bearer ${token}`, token)).toBe(true);
    expect(isValidImportToken(`Bearer ${token}x`, token)).toBe(false);
    expect(isValidImportToken(token, token)).toBe(false);
    expect(isValidImportToken(null, token)).toBe(false);
  });

  it('stays disabled when the configured token is unset or shorter than 32 characters', () => {
    expect(isValidImportToken('Bearer ', '')).toBe(false);
    expect(isValidImportToken(`Bearer ${token}`, undefined)).toBe(false);
    expect(isValidImportToken('Bearer short-token', 'short-token')).toBe(false);
  });
});
