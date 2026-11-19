# Journal publication

- Replaying or concurrently submitting an edit version creates multiple revisions or changes its publication timestamp.
- A failed pointer write exposes a missing revision, loses the previous live pointer, or creates another revision on retry.
- A stale publish overwrites a newer edit, or a new edit reuses an older revision.
- An invalid or missing draft creates a revision.
- Repeated publications recreate the index, or a failed index setup prevents later attempts from retrying.
- Legacy duplicate snapshots with missing or null publication keys prevent the partial unique index from building.
- Index permissions or conflicting existing index options prevent an otherwise valid publication.

Use ordered, retryable publication on the standalone disposable Mongo (transactions require a replica set, which the checked-in Compose service does not provide). Insert an immutable revision keyed uniquely by journey and published edit version before updating the version-guarded live pointer. A failed pointer write can leave a staged revision, never a dangling public pointer; retry completes it. This is recoverable ordering, not multi-document atomicity. Historical revisions have no edit-version key and remain unchanged.

Demo: `npx playwright test e2e/journal-publish.spec.ts` prints the actual Mongo revision count after two identical admin publish requests and attaches fixture JSON.

The publication index includes only numeric edit-version keys. Legacy snapshots with missing or null keys are excluded, left unchanged, and not inferred to belong to a particular edit version. The first new publication creates one keyed snapshot; replay reuses it. Tests also include a unique `(journeyId, sequence)` index alongside Mongo's `_id` index. No legacy revision-index initializer was found in the repository.

Index setup is memoized per process. If it fails (including `IndexOptionsConflict`), log the error, clear the memo so a later request retries, and continue through the existing find-first revision lookup. Sequential retries remain deduplicated and pointer writes remain ordered/version-guarded. Without the unique index, concurrent requests across processes can create duplicate keyed snapshots; this degraded mode favors publication availability, not guaranteed concurrent deduplication. No existing index is dropped or changed by the publish path.
