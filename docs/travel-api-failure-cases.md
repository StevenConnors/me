# Travel API E2E failure cases

Write these API-level failure cases before the E2E spec:

- A first read with no singleton record does not fail or invent visits; it returns the empty three-list shape, version 0, and no update timestamp.
- A valid complete save omits a geography list, drops valid codes, or returns a response different from persisted state.
- Duplicate codes survive normalization, or a reload returns a different/canonical ordering from the saved record.
- Missing region arrays, extra properties, invalid region codes, or malformed JSON mutate the singleton before returning 400.
- A stale expected version overwrites a newer save instead of returning 409 with current version intact.
- Two concurrent updates using the same version both succeed, or neither succeeds; including the first-write upsert race when no record exists.
- A test touches a non-local/non-disposable database or leaves the singleton changed for later runs.

The E2E spec talks to the running app over HTTP with the local E2E author session and verifies persistence directly in the disposable Mongo database. It snapshots the `travel` record, removes it to exercise version 0 and the first-write race, and restores the original record even when an assertion fails.
