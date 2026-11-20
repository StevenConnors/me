# Admin viewer (read-only) failure cases

A viewer is a GitHub account listed in `ADMIN_VIEWER_GITHUB_IDS` (comma-separated numeric IDs). It may open `/admin/**` pages and admin `GET` APIs, and must never change content.

- `ADMIN_VIEWER_GITHUB_IDS` is absent, blank, or only commas/spaces; no viewer is allowed (fail closed).
- A viewer ID matches by substring or prefix (e.g. `4` vs `42`); only exact IDs match.
- A viewer is matched by email or login instead of the immutable numeric ID.
- Author authentication is not fully configured (`AUTH_SECRET`, GitHub credentials, `ADMIN_GITHUB_ID`); viewers get no session either.
- An account in neither `ADMIN_GITHUB_ID` nor the viewer list can sign in through GitHub.
- An ID listed as both author and viewer loses author write access; author wins.
- Removing an ID from the viewer list does not revoke access for an existing session; the role is re-evaluated on every request.
- A viewer cannot open admin pages and is redirected to sign-in.
- A viewer can load admin `GET` APIs (journeys, media, photos page, travel, collections).
- A viewer can `POST`/`PUT`/`PATCH`/`DELETE` any admin API (journey save/publish, media upload/finalize/delete, photos draft/publish/discard, travel save, collections); each must return 403 and leave the database unchanged.
- A viewer gets 401 instead of 403 on writes, hiding that the account is recognized but read-only.
- The admin header does not tell the viewer the session is view-only.
- The development-only E2E viewer override works in production, or with `E2E_TEST_MODE` unset.
- The author's existing E2E session or write access changes when no viewer override is set.
- Admin pages emit console errors or page errors for a viewer.
