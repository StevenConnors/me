---
name: self-review
description: Review your own diff for quality, scope and performance risk before opening or updating a PR. Use after implementation and before verify-change.
---

# Self-review the diff

Read the full diff as a reviewer would: `git diff origin/main...HEAD` (plus `git status` for untracked files). Fix findings before running the verification gate.

## Scope
- One concern per PR. If the diff mixes a feature with refactors, renames, formatting or dependency bumps, split it.
- Target < ~400 changed lines excluding lockfiles, fixtures and generated files. Above that, split or justify in the PR description.
- No stray files: screenshots, traces, `.DS_Store`, temp HTML, `.env*`, local reports, planning notes.

## Correctness and maintainability
- Every new branch/error path has a test or an explicit reason it does not.
- No dead code, commented-out code, unused exports, TODOs without an owner, or debug `console.log`.
- No `any`, non-null assertions or unchecked casts on untrusted data; validate at the boundary with the repo's Zod schemas.
- Reuse existing helpers (search `lib/` first). Do not add a dependency for something under ~30 lines.
- Names describe domain intent; comments explain *why*, not *what*.

## Performance red flags (each needs a reason or a fix)
- `"use client"` added to a component that could stay a Server Component, or a large library imported into a client component.
- New top-level imports in shared layouts/components (they land in every route's first-load JS).
- `<img>` instead of `next/image`, missing `width`/`height`/`sizes`, or `priority`/eager loading on below-the-fold media; missing dimensions cause layout shift (CLS).
- Database calls inside loops (N+1), unbounded queries without `limit`, missing index for a new query shape.
- Sequential `await`s that could run in parallel; new work on the critical render path of a public page.
- Effects that refetch or re-render on every keystroke/scroll without debounce or memoization.
- Fonts, third-party scripts or analytics added without `next/font` / `next/script` strategy.

If any red flag is present, run the `measure-ux-performance` skill and include its table in the PR.
