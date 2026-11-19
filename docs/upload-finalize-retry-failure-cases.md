# Upload finalization retry failures

- A temporary 503, 502, network failure, or non-JSON finalization response loses an upload that already reached the provider.
- Retrying finalization sends the file again or changes its session key or provider result.
- A rejected signature, invalid result, mismatched session, or missing session is retried instead of reporting the 4xx error.
- Persistent finalization failures never stop or hide the fact that the file uploaded successfully.
- Successful uploads incur retry backoff or extra provider requests.
- A lost successful finalization response creates duplicate media when retried.

Vitest covers the isolated client workflow and repository idempotency. The media-library E2E covers recovery after a lost successful finalization response with real persistence. No public UI or layout changes.
