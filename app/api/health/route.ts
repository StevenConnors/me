import { getDatabase } from '@/lib/db/collections';

export const dynamic = 'force-dynamic';

export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let healthy = false;
  try {
    await Promise.race([
      getDatabase().then((db) => db.command({ ping: 1 }, { maxTimeMS: 2000 })),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), 3000);
      }),
    ]);
    healthy = true;
  } catch {
    healthy = false;
  } finally {
    clearTimeout(timer);
  }
  return Response.json({
    status: healthy ? 'healthy' : 'unhealthy',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    environment: process.env.VERCEL_ENV ?? null,
    checks: { mongodb: healthy ? 'healthy' : 'unhealthy' },
  }, {
    status: healthy ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
