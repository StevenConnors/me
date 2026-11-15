# Voice memo upload and local transcription

The web app stores the original audio in private Vercel Blob storage and keeps
recording metadata/transcript data in MongoDB. The Mac worker only downloads the
audio and runs Whisper locally with Apple's MLX framework. It does not call a
transcription service; there is no per-minute transcription charge. Blob storage
and normal Vercel/database usage remain subject to their account plans.

## App deployment prerequisites

The feature reuses the app's existing GitHub author login and MongoDB
connection. Set `ADMIN_GITHUB_ID` to the author's immutable numeric GitHub ID
if it is not already configured. In Vercel, create/select a **private** Blob
store for voice recordings and set `VOICE_BLOB_READ_WRITE_TOKEN` to that store's
token; `BLOB_READ_WRITE_TOKEN` is accepted as the existing-store fallback. The
worker endpoints also require `VOICE_TRANSCRIBER_API_TOKEN`, a random secret of
at least 32 characters. Generate one with `openssl rand -hex 32` and place the
same value in Vercel and in the Mac's `scripts/voice.env` file. Keep all three
variables server side. The app connects to the existing MongoDB database and
creates the voice collection indexes automatically when it first opens the
recording feature; no separate database or manual migration is needed.

Set the matching Blob and worker variables in Vercel's Project Settings →
Environment Variables for the deployment environments you use, then deploy.
The audio upload limit is 250 MiB. The upload page only accepts validated
audio types, including iPhone `.m4a`/AAC exports.

## How the pieces fit

1. Sign in as the configured admin, then open `/admin/recordings` on iPhone or desktop.
2. On iPhone, in Voice Memos tap **… → Share → Save to Files**. In the page tap
   **Upload voice memo**, select the exported `.m4a`, optionally set title/notes,
   and upload. Mobile Safari uploads directly to Vercel Blob using an
   authenticated, short-lived upload authorization; the server verifies the
   completed Blob and records its metadata in MongoDB.
3. On the Mac, run the local worker command below. It lists pending recordings,
   claims one with a short renewable lease, fetches audio through the
   authenticated application endpoint, and transcribes it on the M1.
4. The Mac submits transcript text, detected/selected language, model, duration,
   and timestamp segments. Refresh `/admin/recordings` to play audio, copy the
   transcript, and see status.

The original Blob is retained when transcription fails or is retried. A
completed transcript is only replaced by an explicit single-record `--force`
run after the transcription API accepts a replacement.

The Mac uses these authenticated endpoints, all guarded by the dedicated
Bearer token and scoped to `ADMIN_GITHUB_ID`:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/voice/recordings/pending?limit=N` | List pending/expired-claim records and audio route. |
| `GET /api/voice/recordings/{id}` | Read one owned recording for a targeted run or recovery check. |
| `POST /api/voice/recordings/{id}/claim` | Claim a record before download/inference. |
| `POST /api/voice/recordings/{id}/heartbeat` | Renew a running claim during long work. |
| `GET /api/voice/recordings/{id}/audio` | Stream private Blob audio through the authenticated app. |
| `POST /api/voice/recordings/{id}/transcription` | Idempotently save text, language, model, duration, and segments. |
| `POST /api/voice/recordings/{id}/failure` | Mark an active claim failed with a bounded diagnostic. |

## Whisper runtime choice

The worker uses `mlx-whisper` 0.4.3, the upstream MLX implementation packaged
for Apple Silicon. MLX executes the open Whisper model locally using the Mac's
Apple GPU and unified memory. The project pins that runtime version for a
repeatable Python environment. English and Japanese use the same multilingual
checkpoints. Language detection is automatic by default; `--language en` and
`--language ja` provide overrides. The worker always requests transcription,
never translation, and stores segment start/end times when the runtime returns
them.

The table gives approximate converted checkpoint download sizes from the
current MLX Community repositories, not peak memory use. Inference also needs
memory for activations, audio, macOS, and other open apps. Model files and MLX
runtime behavior may change upstream.

| Model choice | Approx. MLX weights | Practical fit on 16 GB M1 | Notes |
| --- | ---: | --- | --- |
| `small` | ~0.5 GB | Very comfortable | Lowest memory use; lower accuracy on difficult audio and Japanese than larger models. |
| `medium` (default) | ~1.5 GB | Comfortable | Good multilingual quality while leaving room for ordinary Mac use. |
| `large-v3` | ~3.1 GB | Fits, with more memory pressure | Choose when quality matters most and the Mac can be left to work; expect slower inference. |
| `turbo` (`large-v3-turbo`) | ~1.6 GB | Comfortable | Much faster than full large-v3 with a small quality tradeoff; worth trying for long memos. |

Sizes refer to converted MLX files in FP16/MLX storage formats and will not
equal total runtime memory. Performance on an M1 depends on the exact M1 model,
audio length, thermals, and competing apps; no CUDA benchmark is used to claim
an M1 speed. The default is `medium` for a quality/memory balance. Set
`WHISPER_MODEL=turbo` if you prefer faster runs, or use `large-v3` when you
prefer the full large model. Model identifiers and local paths can also be
passed directly to `--model`.

Upstream references: [MLX Whisper installation/API/model support](https://github.com/ml-explore/mlx-examples/tree/main/whisper),
[mlx-whisper 0.4.3 on PyPI](https://pypi.org/project/mlx-whisper/0.4.3/),
[Whisper small MLX checkpoint](https://huggingface.co/mlx-community/whisper-small-mlx/tree/main),
[Whisper medium MLX checkpoint](https://huggingface.co/mlx-community/whisper-medium-mlx/tree/main),
[Whisper large-v3 MLX checkpoint](https://huggingface.co/mlx-community/whisper-large-v3-mlx/tree/main),
and [Whisper large-v3-turbo MLX checkpoint](https://huggingface.co/mlx-community/whisper-large-v3-turbo/tree/main).

## Install on the MacBook Pro M1

Install Homebrew if it is not already present: <https://brew.sh/>. Then from a
checkout of this repository:

```bash
./scripts/setup-voice.sh
```

The script checks for Apple Silicon, installs `ffmpeg` with Homebrew if needed,
creates `.venv-voice` with Python 3.11, installs the pinned `mlx-whisper`
runtime, and creates a private `scripts/voice.env` from the example. Fill in
the deployed app URL and the dedicated API token:

```bash
${EDITOR:-nano} scripts/voice.env
```

Use a token generated for the worker and stored in the Vercel project's
server-side `VOICE_TRANSCRIBER_API_TOKEN` variable. Keep the same value in
`scripts/voice.env` on the Mac. Use a password manager or generate a random
value with `openssl rand -hex 32`. Never put it in a `NEXT_PUBLIC_` variable,
the web browser, shell history, or source control. The worker reads
`scripts/voice.env`; exported shell environment variables override values from
that file. You may use `--env-file /private/path/to/file` for a file stored
outside the repository.

Download the default model ahead of time (the first inference also downloads it
automatically if omitted):

```bash
.venv-voice/bin/python scripts/transcribe.py setup-model --model medium
```

To have setup create and download a chosen model in one command, run
`./scripts/setup-voice.sh --model turbo`.

## Run the worker

Transcribe one pending recording (the default is one item):

```bash
.venv-voice/bin/python scripts/transcribe.py pending
```

Transcribe a particular recording: use **Copy recording ID** on its card in
`/admin/recordings`, then pass that ID to the CLI:

```bash
.venv-voice/bin/python scripts/transcribe.py pending --id 0123456789abcdef01234567
```

Drain pending recordings, with optional model/language selection:

```bash
.venv-voice/bin/python scripts/transcribe.py pending --all
.venv-voice/bin/python scripts/transcribe.py pending --all --limit 10 --model turbo
.venv-voice/bin/python scripts/transcribe.py pending --id 0123456789abcdef01234567 --language ja
```

Use `--language auto` (default), `en`, or `ja`. For a completed memo or a
previous failure, `--force` requires `--id`; the old transcript remains intact
until the replacement is accepted. `--keep-audio` retains the downloaded copy in a private ignored local
cache. By default, temporary audio is removed on success and failure. If
submission remains unavailable after idempotent retries, the CLI writes a
private local transcript payload; retry it without rerunning inference using
the printed `python scripts/transcribe.py retry <path>` command.

Use an alternate config location before the subcommand:

```bash
.venv-voice/bin/python scripts/transcribe.py --env-file /secure/voice.env pending
```

The API caps a page at 100 items. `--all` continues requesting pending records
after it finishes each claimed page; combine it with `--limit N` to cap a drain.
Concurrent workers skip active claims. A failed item reports a bounded error to
the application. Failed items do not appear in the pending list; retry one by
ID with `--force`. Completed items are not listed as pending.

## End-to-end check

1. Confirm `VOICE_TRANSCRIBER_API_TOKEN` is set in the Vercel project and the
   matching value is in the Mac's private `scripts/voice.env`.
2. Sign in on iPhone to the deployed app, go to `/admin/recordings`, choose a
   short `.m4a` Voice Memo, and upload it.
3. Confirm it appears in the list with **Pending** and plays in the page.
4. Use **Copy recording ID** on that memo's card, then run
   `.venv-voice/bin/python scripts/transcribe.py pending --id RECORDING_ID`
   on the Mac with the copied ID.
5. Confirm the CLI reports completion; refresh the page and verify status,
   detected language, transcript text, and audio playback. Use the transcript
   copy control to confirm the saved text is selectable.
6. Run the same `pending --id RECORDING_ID` command again. It should report
   that the recording is already completed and leave the transcript unchanged.

For a free, repeatable runtime smoke check without app credentials, use a short
local audio sample with `mlx-whisper` after `setup-model`. The real end-to-end
check above additionally exercises private Blob access, worker authorization,
database association, and the UI.

## Operations and privacy

- The worker token can list pending items, claim them, download their source
  audio, and submit/fail transcriptions. Store it only in trusted server
  configuration and the Mac's private env file; rotate it in both locations if
  it is exposed.
- Audio download and transcription happen on the Mac. The worker sends only
  transcript and transcription metadata back to the app.
- `.voice-audio-cache/`, `.voice-transcripts-pending/`, `.venv-voice/`, and
  `scripts/voice.env` are ignored by Git. Recovery payloads can contain private
  transcript text, so retain them only as long as needed.
- `mlx-whisper` supports local paths and MLX Community model repositories. The
  first model download needs internet access; subsequent inference runs locally.

## Current bounds and verification

- The app follows the existing single-author GitHub allowlist. The worker
  token is scoped to that author and cannot authorize browser uploads.
- The library displays the newest 200 recordings. The worker can drain all
  pending records independently of that display limit.
- Uploads are limited to 250 MiB. Transcript submissions are limited to 4 MB
  of JSON; timestamps and duration are bounded to 24 hours.
- Mixed English/Japanese quality depends on the recording. Automatic detection
  chooses a language for the transcription; use an explicit override when
  needed and review the result.
- The implementation's automated checks use isolated local storage and
  deterministic local inference. Native MLX was additionally checked with
  English and Japanese M4A samples. A deployed private Blob upload and an
  actual iPhone Safari session still need the live check above after the
  deployment environment is configured.

See [verification results and changed files](voice-verification.md) for the
repeatable test commands, artifacts, and checks performed on this branch.
