# Thoughts pagination failure cases

- A page boundary skips thoughts that share a timestamp.
- Paging returns a thought twice or changes the descending ID order for ties.
- Zero, negative, nonnumeric, fractional or empty limits allow unbounded reads.
- A malformed cursor returns an empty success response instead of a JSON 400.
- Empty collections or exhausted pages fail instead of returning an empty page.
- Existing ISO timestamp cursors stop working after the cursor format changes.
- A collection scan and blocking sort make pagination slower as thoughts accumulate.

The API tests use only disposable MongoDB. This change does not alter the public UI.
