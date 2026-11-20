import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { fixtureCloud } from './fixtures.mjs';

export async function withFixtureServer(cwd, port, measure) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = fork(fileURLToPath(new URL('./fixture-server.mjs', import.meta.url)), ['127.0.0.1', port], {
    cwd,
    env: {
      ...process.env, NODE_ENV: 'production',
      CLOUDINARY_CLOUD_NAME: fixtureCloud, CLOUDINARY_API_KEY: fixtureCloud, CLOUDINARY_API_SECRET: fixtureCloud,
    },
  });
  const exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve(`exited (${signal ?? code})`));
    child.once('error', (error) => resolve(error.message));
  });
  const fail = (reason) => new Error(`Refusing to compare: Next.js server at ${baseUrl} ${reason}`);
  const failed = exited.then((reason) => { throw fail(reason); });
  let startupTimer;

  try {
    const [message] = await Promise.race([
      once(child, 'message'),
      failed,
      new Promise((_, reject) => { startupTimer = setTimeout(() => reject(fail('did not start within 60s')), 60_000); }),
    ]);
    clearTimeout(startupTimer);
    if (message !== 'ready') throw fail('did not report readiness');
    return await Promise.race([measure(baseUrl), failed]);
  } finally {
    clearTimeout(startupTimer);
    if (child.kill('SIGTERM')) {
      const terminate = setTimeout(() => child.kill('SIGKILL'), 5_000);
      await exited;
      clearTimeout(terminate);
    }
  }
}
