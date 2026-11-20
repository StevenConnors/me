import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveSiteUrl } from '@/lib/site-url';

afterEach(() => vi.unstubAllEnvs());

describe('resolveSiteUrl', () => {
  it('prefers the explicit public URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.com/path');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'project.vercel.app');
    expect(resolveSiteUrl().origin).toBe('https://example.com');
  });

  it('uses the production hostname without an explicit URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined);
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'me-indol.vercel.app');
    expect(resolveSiteUrl().origin).toBe('https://me-indol.vercel.app');
  });

  it('falls back locally when settings are missing or empty', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', undefined);
    expect(resolveSiteUrl().origin).toBe('http://localhost:3000');
  });

  it('rejects an invalid explicit URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'not a URL');
    expect(() => resolveSiteUrl()).toThrow();
  });
});
