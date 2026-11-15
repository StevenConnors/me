# Voice workflow verification

Implemented on branch `voice`, using GPT-6 Luna agents for the server, UI,
and CLI implementation. Failure cases were documented before implementation;
new coverage uses browser/API/database E2E tests.

## Results

| Check | Result |
| --- | --- |
| `npm run lint` | Pass; existing warnings in journeys, concepts, and journey-lab remain. |
| `npm run typecheck` | Pass. |
| `npm run test` | 33 files, 129 tests pass. |
| `npm run test:e2e` | All 19 tests pass, including four new voice scenarios. |
| `npm run build` | Optimized production build passes. |
| Python AST parsing / setup shell syntax | Pass. |
| Production authentication smoke check | Anonymous admin/pending/audio requests return 401; author page redirects to sign-in; worker token cannot authorize uploads. |
| Production test adapter gate | Returns 404 even with `E2E_TEST_MODE=1`. |
| Browser bundle secret scan | No worker token, Blob token, or their server environment variable names in `.next/static`. |
| Native inference | `mlx-whisper` 0.4.3 runs on Apple Silicon Metal; English and Japanese M4A return text, language, and segments. |
| Real CLI with native inference | Downloads an 11-second English M4A from the local app API and submits 105 transcript characters to its original recording; status becomes completed. |

The native smoke checks used the small multilingual `whisper-tiny` checkpoint
to verify the runtime and integration. They do not benchmark the default
medium model or establish transcription accuracy. Japanese output contained
recognition errors, so review transcripts as with other Whisper models.

## Repeat automated checks

Use the existing [E2E database setup](e2e-authoring.md), or point
`E2E_MONGODB_URI` at a disposable native MongoDB database. The Mac worker itself
does not use Docker. With MongoDB available:

```bash
npm ci
npx playwright install chromium
npm run lint
npm run typecheck
npm run test
WATCHPACK_POLLING=true npm run test:e2e
npm run build
```

To run only the new integration coverage:

```bash
WATCHPACK_POLLING=true npm run test:e2e -- e2e/voice-memos.spec.ts
```

Polling avoids restricted macOS file-watcher errors; it is unnecessary in most
normal development environments. Playwright supplies only local test tokens,
uses a private temporary filesystem adapter for audio, and executes the actual
CLI with a deterministic local `mlx_whisper` module. Token-issuance validation
uses the installed Vercel Blob SDK, without writing to a real Blob store.

### Repeatable artifacts

Playwright stores these under `journey-editor-playwright-results` in the system
temporary directory and attaches the JSON results to the corresponding test:

- `voice-workflow-result.json`: byte preservation, ownership, Range playback,
  claim conflicts, transcript association, failure preservation, repeat safety.
- `voice-mobile-completed.png`: completed transcript at a mobile viewport.
- `voice-batch-result.json`: 101 records drained across API pages, expired
  claim recovery, and stale-claim rejection.
- `voice-recovery-result.json`: saved output during an API outage, recovery
  after lease expiry, and protection of newer completed text.
- `voice-upload-authorization.json`: iPhone MIME normalization, exact pathname
  and byte constraints, and rejection of unsigned callbacks.

## Database and configuration

The existing MongoDB database gains `voice_recordings`; no existing collection
is migrated. First use creates a unique `blobPathname` index and a compound
`ownerId`, `status`, `uploadedAt` index. Original audio stays in private Blob;
documents contain file metadata, author ownership, statuses, claim leases,
transcript text, language, model, duration, segments, and timestamps.

New app configuration: `VOICE_BLOB_READ_WRITE_TOKEN` (or the existing
`BLOB_READ_WRITE_TOKEN` for a private store) and `VOICE_TRANSCRIBER_API_TOKEN`.
The worker adds `APP_BASE_URL` and `WHISPER_MODEL` in its private config file.
Existing MongoDB and GitHub authentication configuration is reused.

## Files added

```text
app/admin/(protected)/recordings/page.tsx
app/admin/(protected)/recordings/RecordingsWorkspace.tsx
app/admin/(protected)/recordings/recordings.module.css
app/api/admin/recordings/route.ts
app/api/admin/recordings/upload/route.ts
app/api/admin/recordings/finalize/route.ts
app/api/voice/recordings/pending/route.ts
app/api/voice/recordings/[recordingId]/route.ts
app/api/voice/recordings/[recordingId]/audio/route.ts
app/api/voice/recordings/[recordingId]/claim/route.ts
app/api/voice/recordings/[recordingId]/heartbeat/route.ts
app/api/voice/recordings/[recordingId]/transcription/route.ts
app/api/voice/recordings/[recordingId]/failure/route.ts
app/api/e2e/voice-upload/route.ts
lib/client/upload-voice.ts
lib/voice/api.ts
lib/voice/repository.ts
lib/voice/schema.ts
scripts/transcribe.py
scripts/setup-voice.sh
scripts/requirements-voice.txt
scripts/voice.env.example
e2e/voice-memos.spec.ts
docs/voice-memos.md
docs/voice-verification.md
docs/voice-server-failure-cases.md
docs/voice-ui-failure-cases.md
docs/voice-cli-failure-cases.md
```

## Files modified

```text
app/admin/AdminHeader.tsx
lib/db/collections.ts
package.json
package-lock.json
playwright.config.ts
.env.local.example
.gitignore
README.md
```

## Live verification still required

No deployed store token is present in this checkout. The real private Blob
service and a physical iPhone Safari session were not exercised here. Configure
the private store and matching worker token, deploy this branch, then follow
the exact [live end-to-end check](voice-memos.md#end-to-end-check).
