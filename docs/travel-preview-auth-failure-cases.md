# Travel preview authentication failure cases

Before changing the author-session flow, account for these cases:

- `AUTH_SECRET` is absent or blank; return no author session before NextAuth attempts to initialize.
- GitHub provider credentials (`AUTH_GITHUB_ID` or `AUTH_GITHUB_SECRET`) are absent or blank; fail closed without a session.
- The configured author allowlist (`ADMIN_GITHUB_ID`) is absent or blank; fail closed without a session.
- Only some credentials are configured; treat the configuration as incomplete and fail closed.
- Production has `E2E_TEST_MODE=1`; the development-only E2E override must not grant access or bypass configuration checks.
- The explicit development E2E test mode is enabled; its intentional test author session remains available for E2E flows.
- All credentials are configured; preserve the existing NextAuth session lookup and author-ID allowlist check.
- Unconfigured admin page requests receive no author session and follow the existing sign-in/setup redirect flow.
- Unconfigured admin API requests receive no author session and remain unauthorized; no handler-level bypass is added.
