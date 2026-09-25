# Media library audit

Run `npm run media:audit` to compare all uploaded Cloudinary images and videos with MongoDB's `media_assets` collection. The report also lists exact checksum duplicates, missing media references in published Photos and Journey content, divergence between the published Photos sequence and the legacy `showInPhotos` flag, and assets whose stored capture date equals Cloudinary's upload date.

The command is read-only. It fetches Cloudinary inventory and reads `media_assets`, `photos_pages`, `journeys`, and `journey_revisions`; it does not change either system. It loads credentials from `.env.local` or the environment and never prints values or request bodies.

To save the full report as JSON, run `npm run media:audit -- --json reports/media-audit.json`. This creates or overwrites the explicitly named output file. With no JSON option, only summary counts are printed. The full artifact includes asset public IDs and media IDs for investigation, so store it with the same care as other internal library reports.

Cloudinary `created_at` is treated only as the upload date. A matching stored `captureDate` is a signal for review, not proof that the date is wrong. Duplicate groups require an exact Cloudinary `etag` checksum.

Implementation hazards considered before coding are listed in [media-audit-failure-modes.md](media-audit-failure-modes.md).
