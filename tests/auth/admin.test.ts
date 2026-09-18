import { describe, expect, it } from 'vitest';

import {
  isAllowedAuthor,
  isAuthorAuthenticationConfigured,
} from '@/lib/auth/admin';

describe('admin authorization', () => {
  it('allows only the configured immutable GitHub account ID', () => {
    expect(isAllowedAuthor({ id: '42' }, '42')).toBe(true);
    expect(isAllowedAuthor({ id: '42' }, '43')).toBe(false);
    expect(isAllowedAuthor({ email: 'same@example.com' }, '42')).toBe(false);
    expect(isAllowedAuthor({ id: '42' })).toBe(false);
  });

  it('requires every authentication variable before enabling the author flow', () => {
    expect(
      isAuthorAuthenticationConfigured({
        AUTH_SECRET: 'secret',
        AUTH_GITHUB_ID: 'client',
        AUTH_GITHUB_SECRET: 'provider-secret',
        ADMIN_GITHUB_ID: '42',
      }),
    ).toBe(true);
    expect(
      isAuthorAuthenticationConfigured({
        AUTH_SECRET: 'secret',
        AUTH_GITHUB_ID: 'client',
        ADMIN_GITHUB_SECRET: 'provider-secret',
      }),
    ).toBe(false);
  });
});
