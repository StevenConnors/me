# Voice server failure cases

Before implementation, record the failures the upload, worker, and playback paths must handle.

## Upload and ownership

- An anonymous or non-author user requests an upload token.
- A client submits malformed JSON, an invalid ObjectId, an unsupported extension or MIME type, a misleading filename, an oversized byte count, or extra fields.
- The MongoDB reservation cannot be created before an upload token is granted.
- A token payload changes its reserved recording ID, owner, pathname, content type, or maximum size.
- The Blob callback is forged, missing, or references a file with the wrong pathname, MIME type, or size.
- The Blob upload succeeds but the callback/finalize request or database write fails; author retry must safely inspect the deterministic private path and finalize idempotently.
- A recording is uploaded twice or two upload attempts race; path uniqueness and conditional updates must prevent duplicate records or cross-owner adoption.
- The private Blob token is not configured; fail closed instead of silently making audio public.
- The test upload adapter is reachable outside explicit non-production E2E mode.

## Worker authorization and claiming

- Missing, malformed, short, or incorrect Bearer credentials are rejected without leaking whether a token is configured; comparison should use constant-time bytes.
- Browser/session users cannot call worker endpoints with worker privileges; only the configured author can access normal recording UI/API.
- Invalid recording IDs and malformed/oversized JSON are rejected before database access or writes.
- A worker attempts to claim a different owner's recording, steal an unexpired claim, submit after its lease expires, or submit with another claim ID.
- Two workers claim the same pending item concurrently; exactly one claim succeeds.
- A worker crashes after claiming; an expired processing lease becomes pending/reclaimable.
- Force retries must not replace an active claim and must preserve a previous transcript until a replacement succeeds.
- Failed transcription writes useful bounded diagnostics while retaining original Blob and any prior successful transcript.
- A completed submission is retried identically (idempotent success) or retried with conflicting content (conflict, no overwrite).
- Transcript, segment, model, language, duration, or failure payloads exceed bounds or contain NaN/infinite timestamps.

## Private audio retrieval and UI data

- Worker or owner requests audio for a nonexistent, uploading, or foreign recording.
- Private Blob fetch fails, returns non-audio content, or times out; errors should be sanitized.
- Range requests include malformed, unsatisfiable, suffix, or open-ended byte ranges; valid ranges must return 206 and correct Content-Range without buffering the full audio into memory.
- Listing responses must omit worker claim IDs, leases, internal Blob credentials, and private operational errors; only the owner's records are visible.
- Database/index initialization or schema parsing fails; API errors stay controlled and logs retain server-side diagnostics.
