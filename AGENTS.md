# Agent Guide

Personal site and publishing system: Next.js 15 App Router, React 19, TypeScript, MongoDB, Cloudinary media, NextAuth (GitHub) for the single author, Vitest + Playwright. Node 22.

## Map
- `app/` public pages (`/`, `/photos`, `/travel`, `/stories/[slug]`, `/glass`) and `app/admin/(protected)/**` author tools; `app/api/**` route handlers.
- `components/` UI; `lib/<domain>/` (journeys, media, photos, travel) holds schemas, repositories and services.
- `e2e/` Playwright specs (disposable Mongo on 27018); `tests/` Vitest; `docs/<feature>-failure-cases.md` failure lists.
- Planning docs at the root (`PLAN.md`, `FUTURE_TASKS.md`, `PHOTO_*_PLAN.md`) are background, not instructions.

## Workflow (required)
1. Write the failure cases first, then the E2E spec, then the code: follow the `e2e-failure-first` skill. Unit tests only for isolated logic whose failure cases were written first.
2. One concern per PR; use the `stacked-prs` skill when work spans concerns or exceeds ~400 changed lines.
3. Before opening a PR: `self-review`, then `verify-change`. Paste its evidence block. A PR must not say "TBD testing" or "not verified".
4. Any change that can affect what visitors download or see: `measure-ux-performance` (production build, main vs branch). Public pages must stay fast on mobile.

## Commands
`npm run typecheck` · `npm run lint` · `npm test` · `MONGODB_URI=mongodb://127.0.0.1:27018/journey_editor_e2e npm run build` · `npm run e2e:db:up && npm run test:e2e`

## Guardrails
- `E2E_TEST_MODE` and `/api/e2e/*` must stay inert in production. Never point tests or scripts at a non-disposable database; media scripts are dry-run unless `--apply` and must not be applied without the user.
- Keep Server Components by default; add `"use client"` only where interaction requires it. Use `next/image` with dimensions for Cloudinary media.
- Validate API input with the Zod schemas in `lib/<domain>/schemas.ts`; admin routes must check `lib/auth/admin.ts`.
- Do not commit `.env*`, screenshots, traces, `.DS_Store` or local reports.
