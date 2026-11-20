---
name: verify-change
description: Run the pre-PR verification gate for this repo and write the evidence block for the PR description. Use before opening or updating any PR.
---

# Verify a change before opening a PR

Use Node 22 (matches CI). Run from the repo root. Never describe a check you did not run as passing.

## 1. Always (every PR)
```bash
npm ci                      # only if package-lock.json changed or node_modules is missing
npm run typecheck
npm run lint                # must add no new warnings vs master
npm test
MONGODB_URI=mongodb://127.0.0.1:27018/journey_editor_e2e npm run build
git diff --check
```
`npm run build` throws without `MONGODB_URI` (`lib/mongodb.js` connects at import time); the URI only has to be syntactically valid.

## 2. Choose E2E specs by what changed
Start the disposable DB once: `npm run e2e:db:up`. Run the narrowest specs first, then the full suite before the PR.

| Changed paths | Specs to run |
| --- | --- |
| `app/api/thoughts/**`, `lib/thoughts/**` | `e2e/thoughts-pagination.spec.ts` |
| Journal / Photos save and release status | `e2e/editor-release-status.spec.ts` |
| Journal publication replay / recovery | `e2e/journal-publish.spec.ts` |
| `app/api/health/**`, `scripts/smoke/**` | `e2e/production-health.spec.ts` |
| `app/admin/(protected)/journeys/**`, `components/editor/**`, `lib/journeys/**` | `e2e/authoring-flow.spec.ts`, `e2e/journey-autosave.spec.ts`, `e2e/journey-public-url.spec.ts` |
| `app/admin/(protected)/media/**`, `lib/media/**`, `components/media/**` | `e2e/media-*.spec.ts`, `e2e/mobile-admin-media.spec.ts` |
| `app/photos/**`, `components/photos/**`, `lib/photos/**` | `e2e/photo-viewer.spec.ts`, `e2e/home-photos-media.spec.ts` |
| Photos media deletion guards | `e2e/media-photos-delete.spec.ts` |
| `app/travel/**`, `components/travel/**`, `lib/travel/**` | `e2e/travel*.spec.ts` |
| `app/glass/**`, `lib/glass/**` | `e2e/glass-collection.spec.ts` |
| `app/stories/**`, `content/stories/**`, `components/Story.tsx`, `components/Step.tsx` | `e2e/legacy-story.spec.ts`, `e2e/authoring-flow.spec.ts`, `e2e/journey-public-url.spec.ts` |
| collections / suggestions | `e2e/collection*.spec.ts`, `e2e/media-enrichment*.spec.ts` |
| auth, `middleware`, `next.config.js`, `package.json`, shared layout | full suite |

```bash
npx playwright test e2e/travel.spec.ts     # narrow
npm run test:e2e                           # full, before opening the PR
npm run e2e:db:down
```

## 3. User-facing performance
If the diff touches a public route (`app/page.tsx`, `/photos`, `/travel`, `/stories`, `/glass`, `components/**`, images, fonts, `next.config.js`, dependencies), run the `measure-ux-performance` skill and paste its table.

## 4. Evidence block (paste into the PR description)
```markdown
## Verification
- typecheck / lint / unit / build: pass (N unit tests, 0 new lint warnings)
- E2E: `<exact command>` → N passed. Artifacts: <attached screenshot/JSON names>
- UX performance: <table from measure-ux-performance, or "not applicable: <reason>">
- Not run: <check> — <exact blocker>
```
Never open a PR whose description says "TBD testing" or "not verified"; finish verification or open it as a draft and say what is missing.
