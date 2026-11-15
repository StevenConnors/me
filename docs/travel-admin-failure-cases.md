# Travel editor failure cases

Before implementation, account for these failure modes:

- An unknown region or place code is submitted; reject it without changing persisted selections.
- A place code is repeated within a region; normalize duplicate-free selections and preserve stable catalog order.
- A request body is malformed, has extra properties, or carries a missing, negative, non-integer, or stale expected version; return a client error or version conflict without overwriting newer data.
- Two authors save concurrently; use compare-and-set on the stored version so only one update succeeds and the loser can reload/resolve the conflict.
- MongoDB is unavailable on read or write; return a safe service error and do not present unsaved local edits as saved.
- An unauthenticated caller reaches either admin API method; require the existing author session and return 401.
- The editor's initial load fails; show a recoverable error and prevent saving against an unknown version.
- A save fails after the user edits selections; retain the complete local selection state and keep the unsaved indicator.
- A save succeeds but response parsing or UI update fails; avoid clearing local edits before confirming the canonical server response.
- Clearing selections is a valid explicit edit; persist an empty selection object without inventing historical visits.
- Search has no matches or aliases match; show an accessible empty state and include aliases in filtering.
- Keyboard or touch interaction toggles a place; expose native checkbox semantics and sufficiently large targets.
