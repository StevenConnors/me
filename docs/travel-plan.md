# Travel atlas feature

## Product scope

Add a Travel entry to the personal site's navigation, leading to `/travel`. Three tabs show countries and territories, the 50 US states, and Japan's 47 prefectures. Each tab pairs a geographic SVG map with a visited count and an alphabetical list. Visited places share a consistent highlight. The page uses the site's existing paper-like visual style and works on a phone.

The protected `/admin/travel` page lets the author find places by name, select them from a list, or toggle them on the map. Selections survive tab changes; an explicit save persists all three groups and updates the public page. Stable geographic codes are stored in MongoDB. No visit history is inferred or prepopulated. Errors preserve unsaved work, and a version check prevents a stale editor from overwriting newer changes.

## Delegation

Three Luna agents implement separate boundaries: geography and public presentation; persistence and the admin editor; and browser acceptance tests with repeatable visual artifacts. The orchestrator integrates the work, checks security and error behavior, runs verification, reviews desktop and phone screenshots, and publishes a preview of the feature branch.

## Verification and release

1. Record failure cases before implementation. Add browser tests for save, reload, map/list agreement, removal, independent tabs, keyboard access, mobile layout, invalid input, stale saves, and recoverable errors.
2. Use only a disposable local MongoDB for automated write tests. Capture fixture-based screenshots of the three public maps and admin page; label fixture data in the handoff.
3. Run type checking, the existing test suite, lint, a production build, and the browser suite. Resolve feature regressions before opening a PR; report unrelated baseline failures precisely.
4. Review the actual public and admin pages in a browser, including phone width and all three maps. Check navigation, touch targets, selected colors, legibility, list consistency, and overflow.
5. Keep reviews stacked: `codex/travel-atlas-data` supplies the catalog, persistence, protected API, and HTTP acceptance flow; `codex/travel-atlas` adds the public maps and admin editor on that foundation. Check both branch states before opening their PRs. Deploy the complete feature through the repository's existing Vercel preview integration. Keep production unchanged for review. Verify the deployed branch and `/travel` response. Check the deployed public page visually and verify admin access remains protected.
6. Return the mobile-accessible preview URL, branch/PR, screenshots, test results, and any remaining access limitation. Never publish fixture visit data to the real database.
