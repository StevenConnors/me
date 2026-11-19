# Journal publication

- Replaying or concurrently submitting an edit version creates multiple revisions or changes its publication timestamp.
- A failed pointer write exposes a missing revision, loses the previous live pointer, or creates another revision on retry.
- A stale publish overwrites a newer edit, or a new edit reuses an older revision.
- An invalid or missing draft creates a revision.

Use ordered, retryable publication on the standalone disposable Mongo (transactions require a replica set, which the checked-in Compose service does not provide). Insert an immutable revision keyed uniquely by journey and published edit version before updating the version-guarded live pointer. A failed pointer write can leave a staged revision, never a dangling public pointer; retry completes it. This is recoverable ordering, not multi-document atomicity. Historical revisions have no edit-version key and remain unchanged.

Demo: `npx playwright test e2e/journal-publish.spec.ts` prints the actual Mongo revision count after two identical admin publish requests and attaches fixture JSON.
