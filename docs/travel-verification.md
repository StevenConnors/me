# Travel map E2E verification

## Failure cases written before the E2E spec

- A visitor cannot reach the public Travel page from the main navigation, or one of the Countries, US states, or Japan prefectures views is missing.
- A selected region is shown inconsistently between the map, region list, and selected count, including after switching tabs.
- Selecting a region with a pointer works but keyboard activation does not, or keyboard focus cannot reach the region controls.
- Search does not find a catalog region by its name/code, or clearing the query leaves stale filters that hide other regions.
- Saving reports success before persistence, loses one geography group, duplicates codes, or fails to publish the same data to the public route.
- Reloading the admin page loses saved selections, or removing selections does not clear them from the public page.
- An outdated expected version overwrites newer saved travel, or invalid codes/malformed selections are accepted.
- An unauthenticated request can read or write the admin API, or a protected admin page is rendered without author access.
- The map/list overflows a 390px viewport, has controls too small to use by touch, or tab navigation becomes unusable on mobile.
- A test leaves the singleton travel record changed for another E2E run or touches a non-disposable database.

## Repeatable E2E flow

Run against the disposable Mongo database on port 27018. The app server and Playwright process must use the same `E2E_MONGODB_URI`; the travel implementation uses `travel` as its collection:

```sh
npm run e2e:db:up
E2E_MONGODB_URI=mongodb://127.0.0.1:27018/travel_atlas_e2e npx playwright test e2e/travel.spec.ts e2e/travel-api.spec.ts
npm run e2e:db:down
```

The spec snapshots the singleton `travel` document, clears it for a deterministic start, and restores it in `finally`. It uses the existing local E2E author session for the protected admin flow. Authorization behavior is covered by the API implementation and should be checked outside `E2E_TEST_MODE`, which intentionally grants the local test author session. Never point the test at a production or personal database.

The browser flow saves a fixture selection in each geography group, checks the public map/list/count, reloads the admin view to verify persistence, then removes all selections and confirms the public view is empty. Additional checks cover map and keyboard selection, search, a failed-save retry, invalid/stale API writes, a 390px mobile viewport, desktop layout, map geometry, and browser runtime errors. Screenshots are attached to the Playwright result with `e2e-fixture-` prefixes: `e2e-fixture-travel-mobile-countries.png`, `e2e-fixture-travel-mobile-us-states.png`, `e2e-fixture-travel-mobile-japan-prefectures.png`, `e2e-fixture-travel-mobile-admin.png`, and `e2e-fixture-travel-desktop.png`. The API spec attaches JSON observations from version 0, validation failures, persistence, and concurrent first saves. All artifacts use fixture-only data and are repeatable from the flow.

## Expected result

The public route at `/travel` presents all three geography tabs and only displays persisted selections. The protected `/admin/travel` editor supports map/list selection and search, reports save completion, and retains the saved version after reload. Admin reads/writes require authorization; malformed input returns 400 and stale compare-and-swap writes return 409. No page has horizontal overflow at 390px.

## Verified branch results

- Foundation branch: typecheck, lint, production build, 129 existing tests, and all 17 browser/API flows passed.
- Complete feature branch: typecheck, lint, production build, 129 existing tests, and all 18 browser/API flows passed. Lint has only the repository's pre-existing warnings.
- Travel acceptance covers all 249 country/territory controls, 50 states, and 47 prefectures with nonempty SVG geometry; map and list selection, keyboard controls, accent-insensitive search, failed-save retry, persistence, removal, validation, and stale/concurrent saves.
- Runtime error collection passed after correcting SVG title hydration. Screenshots cover 390px mobile public maps and editor plus a 1440px public page. All highlighted destinations in screenshots are disposable test fixtures.
- Separate production-mode HTTP verification, with all authentication credentials absent, checks the public page, admin redirect to the setup notice, unauthorized API reads/writes, and a disabled test-upload endpoint, even when the development-only test flag is present. The configuration guard prevents an unconfigured preview from failing during NextAuth initialization.

The Vercel Preview environment currently lacks author sign-in configuration. Public maps work there; author editing is verified locally with the development-only E2E session. Preview sign-in requires environment/OAuth configuration through authorized Vercel access. Production credentials were not copied or changed.
