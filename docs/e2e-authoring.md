# Local authoring E2E flow

The Playwright suite exercises the editor in a real local Next.js deployment:

1. Create a journey.
2. Write and save its title, public slug, summary, and body text.
3. Upload a sample PNG to the Media library, make it the cover, and insert it into the writing canvas.
4. Publish the journey and verify the public URL.
5. Edit the title and body, republish, and verify the public URL now renders the new immutable revision.
6. Delete the journey through the editor and confirm its public URL returns `404`.

The test removes the journey and its sample media in cleanup, including when an assertion fails.

## Run locally

Install dependencies and the Chromium binary once:

```bash
npm install
npx playwright install chromium
```

Start the disposable MongoDB instance, then run the browser test:

```bash
npm run e2e:db:up
npm run test:e2e
```

The local app runs at `http://127.0.0.1:3001` and MongoDB at `mongodb://127.0.0.1:27018/journey_editor_e2e`. Tear down all local E2E database data afterward with:

```bash
npm run e2e:db:down
```

To use a differently named disposable database, set `E2E_MONGODB_URI`. To run against an already-started local deployment, set `E2E_BASE_URL`; that deployment must be started with `E2E_TEST_MODE=1` and the same test-only MongoDB URI.

## Continuous integration

GitHub Actions runs the typecheck, unit suite, and this Playwright flow on every pull request and push. The browser job starts an isolated `mongo:7` service, installs Chromium, and starts the same local Next.js deployment configured by `playwright.config.ts`. No third-party authoring, media, or production database credentials are used.

## Isolation guarantees

`E2E_TEST_MODE=1` is accepted only outside production. It supplies a fixed local author session and an in-process media provider that accepts the sample upload without calling GitHub or Cloudinary. The Playwright configuration sets it only for its local Next.js server, and overrides `MONGODB_URI` with the E2E database. Never point `E2E_MONGODB_URI` at a production database.
