# Critical dependency remediation failure cases

Written before changing dependency versions. The baseline production audit reports
three critical vulnerable packages: `next`, `fast-xml-parser`, and `tar`.

- A clean install still resolves a critically vulnerable production dependency;
  `npm audit --omit=dev --audit-level=critical` must exit zero.
- A dependency update prevents Node 22 from installing, typechecking, linting,
  running the existing tests, or building the production application.
- Updated Next.js breaks author sign-in protection, journey editing, media
  upload, publishing, deletion, gallery navigation, video playback, or travel
  persistence; run the complete existing Playwright suite on a disposable DB.
- Updated image-processing dependencies break optimized image responses;
  verify an actual image through the production Next.js image endpoint.
- A framework update adds a repeatable mobile page-load regression; compare
  production builds using the same local database, fixtures, and routes.
- The PR accidentally includes the separate agent-workflow patch or the
  uncommitted voice-memo work; review its complete diff against `master`.

Repeatable evidence: save the before/after audit JSON, Playwright JSON report
and fixture screenshot/JSON attachments, production image-check result, and
production performance measurements outside the repository. No new unit tests
are needed: the existing browser suite covers the application workflows.
