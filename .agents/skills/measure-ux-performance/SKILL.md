---
name: measure-ux-performance
description: Measure user-experience performance (LCP, CLS, TBT, FCP, TTFB, JS and total bytes) of public pages on a production build, compare the branch against master, and block regressions. Use for any change that can affect what visitors load or see.
---

# Measure and protect user-experience performance

Lab measurements answer "did this PR make pages slower?" They must compare **master vs branch on the same machine, same data, production build**. `next dev` numbers are meaningless; never report them.

## Metrics and budgets
`scripts/perf/perf-check.mjs` loads each route with a cold cache under a Lighthouse-like mobile profile (412×823, 4× CPU, 150 ms RTT, 1.6 Mbps) and reports the median of N runs.

| Metric | What the visitor feels | Regression if worse than baseline by more than | Absolute target (Core Web Vitals "good") |
| --- | --- | --- | --- |
| LCP | main photo/text appears | 10% and 150 ms | ≤ 2.5 s |
| CLS | page jumps while loading | 0.02 | ≤ 0.1 |
| TBT | page is frozen/unresponsive (lab proxy for INP) | 20% and 50 ms | ≤ 200 ms |
| FCP / TTFB | something appears / server speed | 10%+100 ms / 20%+100 ms | – |
| jsBytes / totalBytes | download cost on mobile data | 5%+10 KB / 10%+50 KB | – |

The script exits 1 on regression or on any HTTP ≥ 400 / page error.

## Routes for this repo
`/`, `/photos`, `/travel`, `/glass`, `/thoughts-aloud`, plus one published journey `/stories/<slug>` and `/photos?photo=<id>` (viewer) when the change touches them. Add the route you changed if it is not listed.

## Procedure
1. Start a disposable DB and seed deterministic fixtures (same data for both builds):
   `npm run e2e:db:up`, then seed with the same approach the E2E specs use (insert `media_assets`, a published `photos_pages` doc, a published journey and a `travel` doc into `journey_editor_e2e`). Keep fixture image URLs identical across runs.
2. Build and serve **master** in a worktree:
   ```bash
   git worktree add ../me-base origin/master && (cd ../me-base && npm ci)
   (cd ../me-base && MONGODB_URI=$URI npm run build && MONGODB_URI=$URI npx next start -p 3200 -H 127.0.0.1) &
   node scripts/perf/perf-check.mjs --base-url http://127.0.0.1:3200 --routes /,/photos,/travel --runs 5 --out .perf/baseline.json
   ```
3. Stop it, build and serve the **branch** on the same port, then compare:
   ```bash
   node scripts/perf/perf-check.mjs --base-url http://127.0.0.1:3200 --routes /,/photos,/travel --runs 5 --baseline .perf/baseline.json
   ```
4. Vet the numbers (see below) before reporting. If a metric regressed: rerun once (noise check). If it reproduces, find the cause (bundle diff from the `next build` route table, new client component, image without dimensions, extra request waterfall) and fix it, or justify it explicitly in the PR and get approval. Do not loosen budgets to make the check pass.
5. Paste the markdown table into the PR's Verification section. Do not commit `.perf/`.
6. Clean up: `git worktree remove ../me-base`, `npm run e2e:db:down`.

## Vet the number before you trust it
Adapted from pstack's `benchmark-checklist` (MIT). Answer each with evidence from a run, not a guess about the code:
- **What limits it?** Name the bottleneck (image bytes, a client bundle, a request waterfall, a slow Mongo query, TTFB) from the build route table, a Playwright trace or the network log. If a change didn't move a metric, the limiter explains why.
- **Same conditions?** Both sides are production builds, same fixtures, same machine, same throttling. Check `uptime` first; if the machine is busy, alternate base and branch runs so both see the same noise.
- **Did it error?** Every route returned 200 with no page errors, and the page rendered the fixture content (not an empty state or the "not initialized" message).
- **Did the work happen?** The measured element is the real LCP element (photo or heading), and images actually loaded rather than 404ing fast.
- **Does it beat the noise?** A difference smaller than the run-to-run range is no measurable difference. Report median and range.
- **Is it physically plausible?** A gain bigger than the piece you changed could cause means you measured a cache, a no-op or a bug.

Report the verdict first (faster, slower, no measurable difference, inconclusive), then the number with unit, run count, range and limiter. Call it inconclusive when you can't name the limiter or couldn't confirm the work happened.

## Also check
- The `next build` "First Load JS" column for every changed route; compare with master's build output.
- Interactions that the lab load does not cover (opening the photo viewer, switching travel tabs): record a Playwright trace with CPU throttling and confirm no long task > 200 ms is added.
- Field data: Vercel Web Analytics is already installed (`@vercel/analytics`). Adding `@vercel/speed-insights` gives real-user LCP/INP/CLS per route; after deploy, compare p75 with the previous week.
