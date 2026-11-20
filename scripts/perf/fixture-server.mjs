import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fixtureCloud, fixtureImage } from './fixtures.mjs';

const [hostname, port] = process.argv.slice(2);
const image = await readFile(fixtureImage);
const fetchUpstream = globalThis.fetch;

// Keep Next's real image optimizer in the measurement; replace only the
// upstream delivery of the seeded asset, not the browser response.
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin === 'https://res.cloudinary.com'
    && url.pathname.startsWith(`/${fixtureCloud}/image/upload/`)
    && url.pathname.endsWith('/perf-photo')) {
    return Promise.resolve(new Response(image, { headers: { 'Content-Type': 'image/png' } }));
  }
  return fetchUpstream(input, options);
};

// Use the production entry point behind `next start`, resolved in the app
// checkout. Its promise resolves only after this process binds and initializes.
const requireFromApp = createRequire(join(process.cwd(), 'package.json'));
performance.mark('next-start');
const { nextStart } = requireFromApp('next/dist/cli/next-start.js');
await nextStart({ hostname, port: Number(port) }, process.cwd());
process.send('ready');
