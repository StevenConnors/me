---
name: e2e-failure-first
description: The repo's required test-first workflow - write the failure cases, then a Playwright E2E spec, then the code, ending with a repeatable artifact. Use when starting any feature or bug fix.
---

# Failure cases first, then E2E, then code

1. **Write the failure list before any code.** Create `docs/<feature>-failure-cases.md` (see `docs/travel-public-failure-cases.md`). Each bullet is an observable failure: wrong data, lost persistence, auth leak, keyboard/mobile breakage, overflow at 390 px, stale/concurrent writes, runtime console errors, and a perf failure ("LCP of /x grows", "layout shifts when images load").
2. **Write the E2E spec next** in `e2e/<feature>.spec.ts` so each failure case maps to at least one assertion. Run it and confirm it fails for the right reason before implementing.
3. **Implement** until the spec passes. Unit tests are allowed only for isolated logic whose failure cases you listed first (pure functions in `lib/`).
4. **Test hygiene** (follow existing specs):
   - Use the disposable DB from `E2E_MONGODB_URI`; snapshot and restore any singleton docs in `finally`.
   - Prefer `getByRole`/`getByLabel`; no `waitForTimeout` for synchronization.
   - Collect `pageerror` and console errors and assert none.
   - Include one 390 px mobile check for any public UI.
5. **Artifact:** attach screenshots and a JSON observation via `test.info().attach(...)` with an `e2e-fixture-` prefix, using fixture data only. Mention the artifact names in the PR.
6. Add the spec to the path → spec table in the `verify-change` skill if it covers a new area.
