# Voice memo UI failure cases

This checklist was written before implementing the browser workflow, as required by the repository instructions. The admin page relies on the recording API for validation and ownership checks; client validation is only an early usability check.

## Upload failures

- No file selected, or the iOS file picker is cancelled.
- A selected file has an unsupported extension or MIME type, including an empty or misleading MIME type.
- The file exceeds the server's 250 MiB limit.
- Authorization or upload preparation fails because the admin session expired or the request is malformed.
- Direct Blob upload fails midway, including a network interruption or a rejected Blob token.
- Blob upload succeeds but recording finalization fails; the UI must retain the same recording ID and metadata so finalization can be retried without uploading a duplicate.
- A successful upload callback and explicit finalization race or repeat; both must be safe to treat as the same recording.
- The network returns a non-JSON or malformed error response.
- The browser component unmounts or the user navigates away during upload; no private Blob URL or upload token is rendered into the page.

## Listing and playback failures

- The recording list request is unauthorized, unavailable, or returns malformed data.
- Refreshing while a request is in flight should not let an older response overwrite newer state.
- A recording's audio endpoint returns an authorization error, missing object, or network error; no private Blob URL should be exposed to the browser DOM.
- Audio metadata or playback is unavailable on Mobile Safari; the recording metadata and status remain usable.
- Transcript text or notes contain markup-like content; render them as text, preserving line breaks without interpreting HTML.

## Transcript and status failures

- Pending, processing, completed, and failed statuses need clear visible labels.
- A completed recording may have an empty transcript; do not claim transcript availability unless text exists.
- A failed re-transcription may still have a previous transcript; show both the failure state and retained transcript when the API provides it.
- Clipboard access may be denied or unsupported; provide a useful error state and keep the transcript selectable.
- A timestamp segment can be malformed or out of range; skip invalid seek controls while retaining transcript text.
