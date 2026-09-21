# Photos page WYSIWYG editor and layout plan

Status: Reviewed implementation contract — ready to split into stacked work  
Last updated: 2026-09-21

## Goal

Replace the current metadata-card Photos editor with an authoring surface that shows the Photos page as it will be published. The author must be able to:

- place photos in an intentional order instead of being locked to capture-date order;
- insert, edit, move, and remove section headers and notes anywhere between photos;
- select several photos at once and remove them from the page or permanently delete unwanted uploads with an explicit confirmation; and
- inspect the exact public desktop and mobile composition before publishing.

The public `/photos` page and the admin preview will use the same renderer and CSS. “WYSIWYG” here means the layout, media order, section placement, breakpoints, and lightbox behavior are shared—not a separate approximation of the public page.

### Non-goals for this change

- redesigning the public visual style;
- adding video, masonry, infinite loading, crops, or arbitrary layout templates;
- replacing the general media-library or journey editors;
- allowing arbitrary rich text, custom HTML, CSS, fonts, or colors;
- implementing collaborative multi-author editing.

These boundaries keep the first delivery centered on trustworthy visual composition and safe bulk editing.

## Why the current implementation cannot meet this goal

Today `MediaRepository.listPhotos()` returns ready image assets sorted by `captureDate` and then `createdAt`. The public page groups that list only when an item has `photoSectionBreak`. The admin editor is a vertical series of individual forms; it can change a date or attach a break to an image, but it cannot own the order or render the public composition.

This means changing a date silently moves an image and its section break, headings cannot exist independently between images, there is no layout draft, deletion is one item at a time, and the admin screen is guaranteed to differ from the four-column public gallery.

## Product decisions

### The page owns layout; media owns reusable metadata

Introduce one persisted Photos page document. It stores an ordered sequence of lightweight blocks that reference existing `media_assets`. Provider IDs, URLs, dimensions, and private metadata remain on the asset. Public copy belongs to the page block so an unpublished caption or alt-text edit cannot leak onto the live page.

```ts
type PhotosPageDocument = {
  schemaVersion: 1;
  blocks: PhotosPageBlock[];
};

type PhotosPageBlock =
  | { id: string; type: 'section'; title?: string; text?: string }
  | {
      id: string;
      type: 'media';
      mediaAssetId: string;
      caption?: string;
      altText?: string;
      decorative: boolean;
      displayDate?: string; // YYYY-MM-DD; presentation only
    };
```

A section block begins a new gallery group. A blank section block is valid and creates visual breathing room without visible copy. A media asset may appear once only; validation rejects duplicate references and unknown properties. New blocks copy caption, alt text, and capture date from the media asset as starting values. Later page edits change the block, not reusable library metadata.

Block rules are explicit:

- media before the first section belongs to an unnamed opening group;
- a section owns every following media block up to the next section;
- drafts may temporarily contain an empty section while the author is editing;
- publishing rejects consecutive or trailing section blocks because they have no media;
- block IDs remain stable through edits and are used only for editing, focus, and React identity;
- the public lightbox order is the media-block order with section blocks omitted.

### Editing is draft-and-publish, not direct public mutation

Store `draftDocument`, `publishedDocument`, `draftVersion`, and timestamps in one `photos_pages` record whose `_id` is the stable string `photos`. A single MongoDB document makes save, publish, and discard atomic without a cross-collection transaction. The public route reads only `publishedDocument`; the author edits only `draftDocument`. API responses derive `hasUnpublishedChanges` by comparing the normalized draft and published documents, not by guessing from timestamps or version numbers.

- **Autosave** records a complete draft with optimistic concurrency after a short debounce.
- **Preview** is the editing canvas itself; an optional full-page preview first flushes autosave, then opens that authenticated saved draft.
- **Publish** first flushes autosave, validates the exact saved `draftVersion`, and atomically copies that draft to the published document.
- **Discard unpublished changes** restores the draft from the last published document after confirmation.

Selection and viewport changes do not autosave. Undo and redo operate on local document commands and therefore do autosave; their history may reset on reload. Only one save request may run at once. If edits arrive during a request, the client coalesces them into the next save. A `409` stops autosave, preserves the local document, and offers **Reload server draft** or an explicit **Replace server draft with mine** action.

This prevents an in-progress reorder, section edit, caption change, or alt-text change from affecting `/photos`.

### Removal and deletion are separate, clearly named actions

Bulk actions work on selected media blocks:

- **Remove from page** removes blocks from the draft layout only. It preserves the reusable media-library asset and Cloudinary original.
- **Delete uploads…** permanently deletes only assets that are absent from the published Photos document and unreferenced by every journey. Its confirmation must show the exact count and filenames and state that deletion is permanent.

The deletion dialog classifies every selected item before enabling confirmation:

- **Ready to delete** — present only in the draft or media library and unused elsewhere;
- **Publish removal first** — still referenced by the published Photos document;
- **Used by a journey** — protected until removed from that journey and no immutable published revision references it.

Published images are never removed and destroyed in one click. The author first removes them from the draft and publishes that visible change, then may permanently delete them in a second explicit action. This keeps the public document from ever pointing at a deleted original.

Bulk deletion is not transactionally all-or-nothing because Cloudinary and MongoDB cannot share a transaction. The server runs every eligible asset through the existing remote-first guarded deletion service and returns one result per ID (`deleted`, `protected`, `not_found`, or `failed`). The UI removes only confirmed deletions and leaves failures selected for retry.

For assets present only in the draft, confirmation first removes their blocks and successfully autosaves that new draft version. Only then does it call bulk deletion. If remote deletion fails, the asset remains available in the media library but no longer occupies a broken draft block; the result offers retry or reinsertion.

### Capture dates are optional library metadata

New uploads may seed the block's `displayDate` from the asset capture date or file timestamp. The inspector exposes display date, caption, and alt text as page-specific draft fields. None changes block order. If chronological ordering is wanted for a batch, provide an explicit “Sort selected photos by date taken” command. It is a deliberate, undoable layout edit.

## Authoring experience

### Layout canvas

The main admin screen is a real rendering of the public Photos page in an editing shell. A sticky author toolbar supplies desktop/mobile viewport toggles; undo/redo; autosave state; Publish and Discard actions; Add photos and Insert section controls; and a selection count with contextual bulk actions.

Refactor the gallery's responsive rules from page-level media queries to container queries on the shared gallery root. The desktop and mobile frames then exercise the same CSS breakpoints as `/photos` even when both are viewed in a wide admin browser. The author chrome lives outside that root or in positioned overlays so it does not change tile measurements.

Media tiles expose authoring controls only on hover/focus: selection checkbox, drag handle, and edit button. They otherwise use the same responsive image, aspect ratio, and grid treatment as the public page. Selected section blocks expose inline title/note fields; unselected blocks look exactly like published content.

The canvas supports pointer drag-and-drop plus keyboard reordering. Keyboard controls provide Move before/after and Move to section actions and announce the result through `aria-live`. Dragging a photo across a section moves it into the destination group. A section is presented as a group handle: moving it moves the section and all following media up to the next section. Removing a section removes only the break and merges its media into the preceding group. The first delivery may use explicit Move controls if accessible drag-and-drop would delay the shared renderer.

Insertion behavior is deterministic: **Insert section** places the new break before the first selected photo, after the selected section's group, or at the end when nothing is selected. **Add photos** uses the same insertion point. After insertion, focus moves to the new section title or first new media tile.

### Media picker and inspector

“Add photos” opens the existing media library and upload control. The picker supports search, cursor pagination, image-only filtering, and selection across pages; already placed media is visibly disabled. Selected items insert at the current insertion point. Uploading creates library assets and inserts corresponding draft blocks, but nothing becomes public until publish succeeds.

Selecting one tile opens a side inspector with preview, filename, display date, caption, alt text, decorative intent, and **Remove from page**. These presentation fields update the draft block. Asset-level title, tags, capture date, and private location remain media-library concerns and are not edited here. Multi-select opens the bulk-action bar.

Alt text may be blank only when `decorative` is true. A new or migrated block uses `decorative: false` when the asset already has alt text and `decorative: true` otherwise; the inspector exposes that choice. Publication requires non-empty alt text for every non-decorative block. Do not silently fall back to a filename because filenames are usually poor accessible descriptions.

### Public reader behavior

The public renderer reads the published block sequence, converts each section and following media run into gallery groups, and preserves lightbox order from that sequence. Media resolution must not rely on MongoDB `$in` result order: build a map by asset ID, then walk the block sequence. It defensively skips missing, archived, failed, or non-image media, reports the problem server-side, and never emits a broken provider URL. The admin canvas instead renders an explicit unavailable placeholder and blocks publication until the reference is repaired or removed.

The page no longer derives composition from `showInPhotos`, `captureDate`, or `photoSectionBreak`. Those legacy fields remain readable only for migration until the new path is deployed and verified.

## Data, API, and migration

### Schema and repository

Use this record shape as the persistence contract:

```ts
type PhotosPage = {
  _id: 'photos';
  schemaVersion: 1;
  draftDocument: PhotosPageDocument;
  draftVersion: number;
  publishedDocument?: PhotosPageDocument;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
};
```

1. Add strict Zod schemas and types in `lib/photos/schemas.ts`. Reuse the repository's application-ID rules for block IDs and reject empty strings after trimming.
2. Add `PhotosPageRepository` methods: `get`, `createIfMissing`, `updateDraft(expectedVersion)`, `publish(expectedVersion)`, and `discardDraft(expectedVersion)`.
3. Bound the document to 500 media blocks and 100 section blocks, section titles to 500 characters, notes/captions to 2,000, and alt text to 1,000. Reject duplicate media IDs and duplicate block IDs.
4. Draft saves perform structural validation. Publish additionally validates section structure and batch-resolves every media reference as unique, ready, image, and not archived.
5. Repository mutations filter on `{ _id: 'photos', draftVersion: expectedVersion }`, increment `draftVersion`, and return a typed conflict when no record matches. Publish copies the exact matching draft to `publishedDocument` in that atomic update; discard copies the published document back to the draft. Both return the incremented version.
6. Add `photosPages` to the collection registry. No secondary index is required because the singleton's `_id` is unique.
7. Extend media deletion guards to check the Photos page as well as journeys. Draft references may be removed by an ordinary draft edit; published references stay protected until their removal is published.

### Admin endpoints

Add authenticated, structured-error endpoints:

```text
GET    /api/admin/photos-page
PATCH  /api/admin/photos-page/draft       # complete document + expectedVersion
POST   /api/admin/photos-page/publish     # expectedVersion
POST   /api/admin/photos-page/discard     # expectedVersion
POST   /api/admin/media/bulk-delete/plan  # classify selected media IDs
POST   /api/admin/media/bulk-delete       # selected media IDs
```

Use `expectedVersion` consistently in request bodies and call the field `draftVersion` in responses. Every successful mutation returns the canonical normalized draft, its new version, and `hasUnpublishedChanges`; publish also returns `publishedAt`. Conflicts return `409 PHOTOS_DRAFT_CONFLICT`; invalid or unavailable media returns a structured `400 PHOTOS_PUBLISH_INVALID` with block IDs and messages.

`GET /api/admin/photos-page` returns the serialized page record plus resolved editor-media DTOs keyed by media ID; it never exposes Cloudinary credentials or private EXIF. Send the complete validated document on save rather than a fragile set of positional endpoints. Client commands make drag, insertion, and undo immediate; autosave debounces the full draft.

The delete-plan endpoint performs a read-only reference check and returns filenames plus the three classifications used by the confirmation dialog. The delete endpoint repeats every reference check to close the race between planning and confirmation, then returns HTTP 200 with an ordered result per requested ID so partial remote failures are unambiguous.

Add cursor pagination and `resourceType=image` filtering to the existing admin media-list endpoint for the picker. Do not make the WYSIWYG editor silently unable to find assets beyond the current 100-item cap.

### Migration

The migration must be idempotent and leave the live page unchanged until the new document is ready. It seeds only what the public page renders today; other eligible assets remain available in the picker instead of appearing unexpectedly after cutover.

1. Read exactly the same bounded result as the current public route: `listPhotos()` with its current default limit and `{ captureDate: -1, createdAt: -1 }` ordering. Record and report the number of additional eligible assets outside that result, but do not add them to the page automatically.
2. Create media blocks in that order; before each `photoSectionBreak`, insert the equivalent standalone section block. Copy caption, alt text, and capture date into the block and derive decorative intent as described above.
3. Insert the singleton with identical initial draft and published documents only when `_id: 'photos'` does not exist. A dry run prints counts, validation issues, and a stable digest without writing.
4. Deploy a temporary read fallback: `/photos` uses `publishedDocument` when present and the current legacy query otherwise. This allows schema and migration rollout before cutover without downtime.
5. Compare old and new group/media order with fixtures and the production dry run. After migration, visually verify both breakpoints before removing the fallback.
6. Keep `showInPhotos` and `photoSectionBreak` for one release as read-only migration data. Then update import scripts and README so import adds to the library rather than silently publishing, followed by a separate cleanup PR for legacy fields and the old chronological index.

Migration is successful only if the ordered media-ID list and each section's title/text match the legacy render. Pixel identity is not required until the shared renderer stack; semantic order must be exact. If the current public result exceeds the new document limit, abort with a clear error rather than truncate.

## Next.js implementation boundaries

- Keep `app/admin/(protected)/photos/page.tsx` and `app/photos/page.tsx` as Server Components. They read repositories directly; neither should call its own HTTP API.
- Load the Photos page record and referenced media together on the server, using parallel work where dependencies allow it. Pass `PhotosWorkspace` and the public gallery plain serialized DTOs only: IDs, strings, booleans, numbers, arrays, and ISO timestamp strings. Never pass MongoDB objects, `Date` instances, repository classes, or provider instances across the client boundary.
- Keep database, authentication, migration, provider URL generation, and deletion checks in server-only modules. Mark presentation/repository modules `server-only` when importing one from a client bundle would expose credentials or Node-only dependencies.
- `PhotosWorkspace` remains a synchronous `'use client'` component that owns selection, command history, autosave scheduling, and drag/keyboard interactions. It must not be an async component.
- Route handlers are an intentional choice for draft mutations despite Server Actions being the normal App Router default: this editor needs abortable/coalesced JSON autosaves, explicit `409` status handling, and consistency with the existing admin media APIs. Initial reads still happen in Server Components; `GET /api/admin/photos-page` exists only for conflict reload/recovery after hydration.
- Set Photos route handlers to the Node.js runtime because they use MongoDB and the existing media provider. Route handlers contain no React rendering.
- Keep `/photos` dynamic during this change, matching its current behavior. If later caching is introduced, successful publish must invalidate `/photos`; do not add cache behavior implicitly in this stack.
- Continue using `next/image` with stored source dimensions and accurate public `sizes`. The editor may overfetch inside a simulated narrow frame because `sizes` follows the browser viewport rather than a CSS container, but it must not change aspect ratio or visual layout. Do not replace optimized images with raw `<img>` tags to work around preview sizing.
- A full-page draft preview, if implemented, flushes autosave before navigation and reads the authenticated saved draft on the server. Do not put the draft document into query parameters or browser storage to cross routes.

## State and failure behavior

- Initial admin load failure shows a retryable error and never initializes an empty draft over unknown server state.
- Upload success followed by draft-save failure leaves the asset in the media library and clearly offers **Insert unsaved upload again**; it does not claim the photo is on the page.
- Publish is disabled while saving, conflicted, structurally invalid, or resolving media.
- A publish failure leaves both the saved draft and current public document unchanged.
- Missing media in a draft has a stable placeholder that can be selected and removed.
- Public rendering skips an invalid reference without closing the whole gallery and logs its block and media IDs.
- Empty published documents render the intentional existing “Photos, soon” state.
- Navigating away with unsaved local commands uses `beforeunload`; a successfully autosaved but unpublished draft does not trigger that warning.

## Delivery stacks

Follow `AGENTS.md`: each stack is a focused, stackable PR with green tests and linting before opening it.

### Stack 1 — Page-document contract

- Add strict schemas, the singleton collection, repository operations, and optimistic-concurrency tests.
- Add authenticated draft, publish, and discard endpoints with structured errors.

Exit condition: a document can be saved, conflicted, published, and discarded atomically without changing the existing public route.

### Stack 2 — Migration and public read model

- Add the uncapped idempotent migration with dry-run digest and semantic comparison tests.
- Add ordered media resolution and the legacy public-read fallback.

Exit condition: the current ordering, metadata, and headings are represented losslessly in a published document while the existing renderer remains live.

### Stack 3 — Shared public renderer

- Extract section/run rendering from `PhotosGallery` into a component that consumes blocks plus resolved public media.
- Convert gallery breakpoints to container queries and make `/photos` read `publishedDocument`.
- Preserve existing lightbox, touch, focus, empty, and responsive behavior.

Exit condition: `/photos` renders the published block order without a date sort and matches desktop/mobile visual snapshots.

### Stack 4 — WYSIWYG authoring canvas

- Replace `PhotosWorkspace` cards with the shared renderer in author mode.
- Add local command history, selection, inline sections, responsive frames, inspector, accessible reordering, autosave/conflict UI, and Publish/Discard controls.
- Test insertion points, section-group moves, merge-on-section-removal, undo/redo, save coalescing, and conflict recovery.

Exit condition: an author can position a section anywhere, order media freely, and verify both breakpoints before publishing.

### Stack 5 — Media picker and upload insertion

- Add searchable, cursor-paginated, image-only media picking with cross-page selection.
- Insert successful uploads at the intended draft position and handle upload/save partial failure.

Exit condition: an author can find or upload an image, insert it precisely, refresh, and recover the saved draft without publishing it.

### Stack 6 — Bulk lifecycle actions

- Add multi-select and bulk remove-from-page.
- Extend reference checks and add classified, guarded permanent bulk deletion with filename/count confirmation and per-item results.

Exit condition: several items can be removed at once, and only assets absent from the published page and all journeys can be permanently deleted.

### Stack 7 — Hardening and cleanup

- Add Playwright authoring coverage, desktop/mobile visual snapshots, keyboard and screen-reader checks, and draft-isolation tests.
- Run the production dry run, deploy, verify `/photos`, then retire the fallback and revise maintenance documentation.
- Remove legacy fields and their index only in a later cleanup after one stable release.

Exit condition: the author sees the same ordered sections and media in admin preview and on `/photos`; drafts never leak publicly.

## Acceptance checks

- Insert a heading between any two photos, leave it blank when desired, and move it with its following group.
- Reorder photos independently of library dates.
- Verify a mobile two-column and desktop preview that match the live public layout.
- Save an unfinished edit, refresh, then publish it without interim public changes.
- Select five photos, remove them from the page, publish, and confirm their originals remain in the library.
- Confirm that a published photo cannot be permanently deleted; remove and publish it, then delete it with an explicit confirmation.
- Confirm that journey-referenced media remains protected and partial bulk-delete failures are reported per filename.
- Preserve captions, alt text, lightbox navigation, Escape, touch gestures, focus return, and responsive loading.

## Verification matrix

### Schema and repository

- Strict parsing rejects unknown block fields, duplicate block IDs, duplicate media references, invalid dates, oversized documents, and overlong copy.
- Draft save increments `draftVersion`; stale save, publish, and discard operations return a conflict without mutation.
- Publish rejects empty sections, unavailable media, non-image assets, and missing alt text on non-decorative media.
- Publishing snapshots the exact expected draft, and later draft edits do not affect the public document.
- Ordered resolution preserves block order even when MongoDB returns assets in a different order.

### Migration

- The migrated ID list exactly matches the current bounded public result; extra eligible assets are counted but remain unpublished.
- Tied and missing capture dates retain the order produced by the existing public query.
- Blank, titled, and text-only section breaks retain their positions and content.
- A second migration is a no-op and reports the existing singleton.
- The legacy fallback works before migration and stops being used afterward.

### Editor components

- Insert section/photo behavior is correct with no selection, a photo selection, and a section selection.
- Section moves carry their group; section removal merges rather than deletes media.
- Multi-select survives ordinary reordering and clears removed IDs.
- Autosave serializes requests, coalesces intervening edits, and preserves local state on `409` or network failure.
- Desktop/mobile frames trigger the same container-query layouts as the public page.
- Keyboard-only users can select, reorder, edit, publish, and restore focus.

### End to end

1. Upload three deterministic fixtures and insert them into an unpublished draft.
2. Add a section between two images, reorder one image across it, and edit its caption.
3. Refresh and confirm the saved draft while the public page remains unchanged.
4. Inspect desktop and mobile frames, publish, and confirm matching public order and copy.
5. Bulk-remove two images and confirm the public page remains unchanged until the second publish.
6. Verify permanent deletion is blocked before publish, allowed afterward for an unused asset, and still blocked for journey media.
7. Exercise lightbox focus, Escape, arrow keys, touch navigation, and focus return.

## Likely files and modules

```text
lib/photos/schemas.ts
lib/photos/repository.ts
lib/photos/presentation.ts
lib/photos/migration.ts
app/api/admin/photos-page/route.ts
app/api/admin/photos-page/draft/route.ts
app/api/admin/photos-page/publish/route.ts
app/api/admin/photos-page/discard/route.ts
app/api/admin/media/bulk-delete/plan/route.ts
app/api/admin/media/bulk-delete/route.ts
app/admin/(protected)/photos/page.tsx
app/admin/(protected)/photos/PhotosWorkspace.tsx
components/photos/PhotosPageView.tsx
components/photos/PhotosGallery.tsx
components/photos/photos-gallery.module.css
lib/db/collections.ts
lib/media/delete-service.ts
```

## Relationship to `PHOTO_GALLERY_PLAN.md`

This plan supersedes that document’s current Photos ordering and section-break assumptions: date-sorted media and `photoSectionBreak` attached to a media record are incompatible with author-controlled placement. Its later masonry, pagination, and video work can be reconsidered after the shared renderer lands, but must consume the published block sequence rather than recreate the page from a sorted media query. They are intentionally outside this WYSIWYG change.
