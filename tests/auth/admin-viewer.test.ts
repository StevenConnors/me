import { describe, expect, it } from 'vitest';

import { adminRoleFor, isAllowedViewer } from '@/lib/auth/admin';

describe('admin viewer authorization', () => {
  it('fails closed when the viewer list is missing or blank', () => {
    expect(isAllowedViewer({ id: '42' }, undefined)).toBe(false);
    expect(isAllowedViewer({ id: '42' }, '')).toBe(false);
    expect(isAllowedViewer({ id: '42' }, ' , ,')).toBe(false);
  });

  it('matches only exact immutable GitHub IDs', () => {
    expect(isAllowedViewer({ id: '42' }, '7, 42')).toBe(true);
    expect(isAllowedViewer({ id: '4' }, '42')).toBe(false);
    expect(isAllowedViewer({ id: '42' }, '420')).toBe(false);
    expect(isAllowedViewer({ email: '42' }, '42')).toBe(false);
    expect(isAllowedViewer(null, '42')).toBe(false);
  });

  it('gives the author precedence and rejects unknown accounts', () => {
    expect(adminRoleFor({ id: '1' }, { author: '1', viewers: '1,2' })).toBe('author');
    expect(adminRoleFor({ id: '2' }, { author: '1', viewers: '1,2' })).toBe('viewer');
    expect(adminRoleFor({ id: '3' }, { author: '1', viewers: '1,2' })).toBeNull();
    expect(adminRoleFor({ id: '2' }, { author: '1', viewers: undefined })).toBeNull();
  });
});
