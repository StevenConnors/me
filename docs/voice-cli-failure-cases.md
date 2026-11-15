# Voice transcription CLI failure cases

Document these failure modes before implementing the worker so its recovery rules are explicit.

| Failure | Required behavior |
| --- | --- |
| Missing or malformed app URL/token | Stop before any request; give a configuration error without printing the token. |
| Non-HTTPS production URL | Refuse to send the bearer token. Permit HTTP only for loopback development URLs. |
| API redirects to another host | Reject the redirect and do not forward authorization credentials. |
| API unavailable, unauthorized, or returns malformed JSON | Report the endpoint/status safely and leave the recording unchanged unless a claim already succeeded. |
| Recording ID is malformed or not found | Reject locally or report not found without using it in an arbitrary URL. |
| Another worker already claimed the recording | Skip it; never steal an active claim. |
| Claim succeeds but audio download fails or is interrupted | Report failure through the claim-scoped failure endpoint when possible; preserve the source Blob. |
| Audio response is redirected off the application origin | Reject it; do not send the worker token to an arbitrary host. |
| Audio download is empty, too large, or inconsistent with metadata | Fail before inference; remove the partial temporary file unless `--keep-audio` requested retention. |
| Unsupported/corrupt media or missing `ffmpeg`/`ffprobe` | Emit an actionable diagnostic, report the claim failed, retain the original recording. |
| MLX runtime/model download or inference fails | Report claim-scoped failure; preserve any existing transcript and original Blob. |
| Inference returns empty text or invalid segment timestamps | Do not submit malformed transcript data; report failure. |
| Heartbeat fails during a long download/inference | Stop treating the claim as owned; do not submit under a potentially expired claim. |
| Transcript POST times out after the server may have committed it | Retry the exact same payload for idempotency; if still uncertain, save a private local recovery payload and print its path. |
| Transcript submission fails after inference | Preserve the local recovery payload; do not re-run inference merely to retry submission. |
| Failure-report request also fails | Keep the original audio and print both the primary and reporting failures without masking the primary error. |
| User interrupts the process | Attempt a best-effort claim-scoped failure report, clean temporary files unless retained, and exit nonzero. |
| `--all` sees more recordings than one response page | Continue paging until drained or the explicit limit is reached. |
| `--force` is used without a specific ID | Reject the invocation; never bulk-overwrite completed transcripts. |
| Local cache cannot be made private | Refuse to write audio or transcript recovery data to an insecure location. |
