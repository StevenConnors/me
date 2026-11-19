import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/health/route';
import { getDatabase } from '@/lib/db/collections';

vi.mock('@/lib/db/collections', () => ({ getDatabase: vi.fn() }));

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.resetAllMocks(); });

describe('health route', () => {
  it('pings Mongo and reports deployment metadata without caching', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc');
    vi.stubEnv('VERCEL_ENV', 'production');
    const command = vi.fn().mockResolvedValue({ ok: 1 });
    vi.mocked(getDatabase).mockResolvedValue({ command } as unknown as Awaited<ReturnType<typeof getDatabase>>);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(command).toHaveBeenCalledWith({ ping: 1 }, { maxTimeMS: 2000 });
    expect(await response.json()).toEqual({ status: 'healthy', commit: 'abc', environment: 'production', checks: { mongodb: 'healthy' } });
  });

  it('returns safe 503 with null missing metadata', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', undefined);
    vi.stubEnv('VERCEL_ENV', undefined);
    vi.mocked(getDatabase).mockRejectedValue(new Error('secret connection details'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unhealthy', commit: null, environment: null, checks: { mongodb: 'unhealthy' } });
  });

  it('bounds a stalled connection', async () => {
    vi.useFakeTimers();
    vi.mocked(getDatabase).mockReturnValue(new Promise(() => {}));
    const response = GET();
    await vi.advanceTimersByTimeAsync(3000);
    expect((await response).status).toBe(503);
    expect(vi.getTimerCount()).toBe(0);
  });
});
