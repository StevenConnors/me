import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const routes = ['/api/health', '/', '/photos', '/travel', '/thoughts-aloud'];

export async function smoke(baseUrl, expectSha, { fetcher = fetch, pause = delay, publicOrigin = '' } = {}) {
  const results = [];
  let storyPath;
  for (const route of routes) {
    let detail = '';
    let passed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetcher(new URL(route, baseUrl), {
          signal: AbortSignal.timeout(15000), cache: 'no-store',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (route === '/api/health') {
          if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
          const body = await response.json();
          if (body.status !== 'healthy' || body.checks?.mongodb !== 'healthy') {
            throw new Error('unhealthy response');
          }
          if (expectSha && body.commit !== expectSha) throw new Error('commit mismatch');
        } else {
          const html = await response.text();
          if (route === '/') {
            storyPath = html.match(/href=["'](\/stories\/[^"'#?]+)["']/)?.[1];
          }
          if (/Application error: a (?:client|server)-side exception|id=["']__next_error__|NEXT_HTTP_ERROR_FALLBACK;[45]\d\d/i.test(html)) {
            throw new Error('Next.js error page');
          }
        }
        detail = `HTTP ${response.status}`;
        passed = true;
        break;
      } catch (error) {
        detail = error instanceof Error ? error.message : 'request failed';
        if (attempt < 2) await pause(1500);
      }
    }
    results.push({ route, result: passed ? 'PASS' : 'FAIL', detail });
  }
  if (publicOrigin) {
    try {
      if (!storyPath) throw new Error('No published journal link on home page');
      const response = await fetcher(new URL(storyPath, baseUrl), {
        signal: AbortSignal.timeout(15000), cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const tag = (html.match(/<link\b[^>]*>/gi) ?? []).find(tag => /\brel=["']canonical["']/i.test(tag));
      const canonical = tag?.match(/\bhref=["']([^"']+)["']/i)?.[1];
      if (!canonical) throw new Error('Missing journal canonical');
      const expected = new URL(storyPath, publicOrigin).href;
      if (canonical !== expected) throw new Error(`Canonical ${canonical}; expected ${expected}`);
      results.push({ route: storyPath, result: 'PASS', detail: `Canonical ${canonical}` });
    } catch (error) {
      results.push({ route: storyPath ?? '/stories/<published>', result: 'FAIL', detail: error instanceof Error ? error.message : 'canonical check failed' });
    }
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: {
      'base-url': { type: 'string' }, 'expect-sha': { type: 'string' },
      'public-origin': { type: 'string' },
    } });
    const baseUrl = new URL(values['base-url']);
    if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('Expected HTTP(S) base URL');
    console.log(`Smoke: ${baseUrl.origin}`);
    const publicOrigin = new URL(values['public-origin']).origin;
    if (!publicOrigin.startsWith('https://') && !publicOrigin.startsWith('http://')) throw new Error('Expected HTTP(S) public origin');
    const results = await smoke(baseUrl, values['expect-sha'], { publicOrigin });
    console.table(results);
    process.exitCode = results.some(({ result }) => result === 'FAIL') ? 1 : 0;
  } catch (error) {
    console.error(`Smoke: ${error instanceof Error ? error.message : 'invalid arguments'}`);
    process.exitCode = 1;
  }
}
