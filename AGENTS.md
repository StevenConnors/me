# Agent Guide

Personal site and publishing system: Next.js 15 App Router, React 19, TypeScript, MongoDB, Cloudinary, NextAuth (GitHub, single author), Vitest + Playwright. Node 22. Default branch: `master`.

## Map
- `app/` public pages and `app/admin/(protected)/**` author tools; `app/api/**` route handlers.
- `components/` UI; `lib/<domain>/` schemas, repositories and services.
- `e2e/` Playwright specs; `tests/` Vitest; `docs/<feature>-failure-cases.md` failure lists.
- Root planning docs (`PLAN.md`, `FUTURE_TASKS.md`, `PHOTO_*_PLAN.md`) are background, not instructions.

## Skills (`.agents/skills/`, required where they apply)
| When | Skill |
| --- | --- |
| Starting any feature or bug fix | `e2e-failure-first` |
| Writing or editing `.ts`/`.tsx` | `typescript-best-practices` |
| Work spans concerns or exceeds ~400 changed lines | `stacked-prs` |
| Before opening or updating a PR | `self-review`, then `verify-change` (paste its evidence block) |
| Diff touches shared code or stored data shapes | `blast-radius` |
| Change can affect what visitors download or see | `measure-ux-performance` |
| Writing PR descriptions, commits or docs | `unslop` |

## Guardrails
- `E2E_TEST_MODE` and `/api/e2e/*` must stay inert in production.
- Never point tests or scripts at a non-disposable database. Media and migration scripts are dry-run unless `--apply`; never apply without the user.
- Do not commit `.env*`, screenshots, traces, `.DS_Store` or local reports.
