# Visual Journey Editor: Implementation Plan and Specification

Status: Draft implementation contract  
Branch: `editor`  
Last updated: 2026-09-18

## 1. Purpose

Build a private, single-author visual editor for creating, arranging, previewing, and publishing journeys without editing MDX or copying Cloudinary paths.

The finished workflow should let the author:

1. Sign in to a private admin area.
2. Create a journey draft.
3. Write and format prose directly in the browser.
4. Drag photographs into the document or select existing photographs from a media library.
5. Reorder text and media blocks.
6. Choose intentional, responsive image and gallery layouts.
7. Set non-destructive crops and focal points for desktop and mobile placements.
8. Preview the exact public presentation at desktop, tablet, and phone widths.
9. Save automatically, recover earlier revisions, and publish without changing source code.
10. Export the journey and its media references in an open, readable form.

This plan turns the direction in `FUTURE_TASKS.md` into an implementation-ready scope. It covers the editor foundation and the migration of one existing story. It does not attempt to deliver every future journey, mapping, social import, or homepage feature.

## 2. Current system baseline

The repository currently has:

- Next.js 15 with the App Router and React 19.
- Stories stored as MDX under `content/stories`.
- Story media referenced through Cloudinary `public_id` paths in `<Step>` components.
- Cloudinary-specific URL construction in `lib/cloudinary.ts` and public components.
- MongoDB connectivity used by the thoughts feature, but no journey or media collections.
- No admin authentication, journey dashboard, visual editor, upload workflow, revision system, or publishing state.
- A public route at `/stories/[slug]` that dynamically imports MDX and falls back to `poc.mdx` when a requested story cannot be loaded.

The editor work must coexist with this system until migrated journeys have been verified. Existing published MDX must not disappear as an incidental side effect of building the admin area.

## 3. Product principles for this implementation

- The application owns content identity. Cloudinary folder paths and URLs are implementation details.
- Original media is immutable. Crops and responsive treatments are reversible presentation data.
- Draft and published content are separate. Saving a draft never changes the public page.
- The editor and public page share rendering components.
- Responsive layout is constrained and intentional, not an arbitrary free-positioning canvas.
- Mobile presentation is designed, not inferred by shrinking a desktop composition.
- Content and media metadata remain exportable.
- The first release optimizes for one author, reliability, and low ongoing cost.
- Existing content remains readable throughout migration.

## 4. Scope

### 4.1 Initial release

The initial shippable release includes:

- Single-author authentication and route protection.
- Journey dashboard with draft, published, and archived filters.
- Journey create, edit, duplicate, archive, publish, unpublish, and rollback actions.
- Journey metadata: title, slug, summary, cover, experienced date or range, optional location labels, and social description.
- A structured visual editor with rich text, photograph, gallery, quote, divider, heading, and story-step blocks.
- Drag-and-drop block insertion and ordering, with keyboard alternatives.
- Signed direct image uploads to Cloudinary.
- A searchable application-owned media library backed by MongoDB records.
- Image title, caption, alt text, tags, capture date, and privacy-safe location editing.
- Non-destructive crop, focal-point, and layout settings per media placement.
- Desktop, tablet, and mobile preview using the real journey renderer.
- Debounced autosave, visible save status, optimistic concurrency, revision snapshots, and recovery.
- Publication validation and immutable published revisions.
- Database-first public rendering with a temporary MDX fallback.
- Migration tooling for Cloudinary assets and at least one existing MDX journey.
- Markdown plus JSON manifest export.
- Automated tests for the critical authoring and publishing path.

### 4.2 Follow-up scope

These should fit the architecture but are not required to ship the first editor:

- New video uploads and video-specific editing controls.
- Map checkpoints and animated geographic transitions.
- External embeds beyond a very small allowlist.
- Bulk media editing.
- Scheduled publishing.
- Instagram archive import.
- A complete redesign of the public homepage and gallery.
- Multi-author roles or real-time collaboration.

### 4.3 Explicit non-goals

- A generic CMS for other websites.
- Arbitrary desktop pixel positioning.
- Separate documents for every responsive breakpoint.
- Storing media binaries in MongoDB or Git.
- Destructively rewriting uploaded originals.
- Writing Git commits from the production server.
- Automatically deleting a Cloudinary asset when a block is removed.
- Supporting arbitrary HTML, JavaScript, iframes, or CSS inside authored content.
- Replacing Cloudinary before real usage demonstrates that it is necessary.

## 5. Architecture decisions

### 5.1 Canonical stores

- MongoDB is canonical for journey drafts, publication state, revisions, media metadata, and internal media identity.
- Cloudinary is the first media origin, transformation, and delivery provider.
- Git remains the source of the application and an optional destination for human-readable exports. It is not the runtime authoring database.
- Published public pages read an immutable revision selected by the journey's `publishedRevisionId`.

### 5.2 Editor framework

Tiptap is the default editor candidate. A time-boxed spike must prove the complete round trip before permanent editor code is built:

1. Render the site's typography inside the editor.
2. Insert and reorder a custom image node that stores `mediaAssetId`, not a URL.
3. Handle file drop and paste with a temporary upload node.
4. Edit layout and crop attributes through a React node view.
5. Serialize to JSON, reload, and render outside the editor.
6. Export to Markdown plus a media manifest.

BlockNote may replace Tiptap only if the same spike requires materially less custom code without forcing provider URLs into stored content. The choice is complete when the spike outcome is recorded in this file.

### 5.3 Responsive layout model

The editor offers named layout choices rather than coordinates:

- `inline`: constrained to the prose column.
- `wide`: wider than prose while remaining inside the page grid.
- `full`: uses the available journey viewport width.
- `left`: image and prose use a defined left-media split on wide screens.
- `right`: image and prose use a defined right-media split on wide screens.
- `pair`: two photographs share a row on wide screens.
- `grid`: a gallery uses a supported two- or three-column template.
- `sequence`: a horizontally scrollable or paged photographic sequence where supported.
- `story-step`: retains the current scroll-linked prose and media behavior.

Mobile fallbacks are limited to:

- `inline`: constrained to the mobile content width.
- `full`: edge-to-edge within the journey viewport.
- `stack`: paired or split content becomes an ordered vertical stack.

The renderer owns the CSS for these names. Documents never store pixel offsets, CSS class strings, or arbitrary style objects.

### 5.4 Shared rendering

The following surfaces must use the same block-rendering package:

- Editor content canvas, with editing chrome around blocks.
- Admin preview route.
- Public journey route.
- Visual regression fixtures.
- Export preview where applicable.

The editor may display selection outlines, handles, upload progress, and controls, but it must not maintain a separate approximation of public typography or crop behavior.

## 6. Information architecture and routes

### 6.1 Admin pages

- `/admin/sign-in`: authentication entry.
- `/admin`: redirect to the journey dashboard.
- `/admin/journeys`: searchable dashboard with status filters.
- `/admin/journeys/new`: create a draft, then redirect to its editor.
- `/admin/journeys/[journeyId]/edit`: metadata and visual editor.
- `/admin/journeys/[journeyId]/revisions`: revision list and restore actions.
- `/admin/media`: searchable media library and upload entry point.
- `/admin/preview/[journeyId]`: authenticated exact preview of the current draft.

### 6.2 Public pages

- Keep `/stories/[slug]` during the migration.
- Resolve a published database journey first.
- If no database journey owns the slug, load the existing MDX story.
- Remove the MDX fallback only after every published story has been migrated and verified.
- A missing slug must return a real 404; it must not silently render `poc.mdx`.

### 6.3 Admin navigation

The admin shell contains:

- Journeys.
- Media.
- Open public site.
- Signed-in identity and sign-out.

The journey editor header contains:

- Back to journeys.
- Editable title or clear untitled state.
- Save state: `Saving`, `Saved`, `Offline`, `Retry needed`, or `Conflict`.
- Preview.
- Publish or update publication.
- More menu: duplicate, revision history, unpublish, archive.

## 7. Detailed authoring specification

### 7.1 Journey creation

- Creating a journey immediately persists an untitled draft and assigns an internal ID.
- The slug is proposed from the title but remains editable until publication.
- Slugs are lowercase, use hyphens, and are unique across non-archived journeys.
- Changing a published slug requires an explicit warning because redirects are not part of the initial release.
- A new draft is private and absent from all public indexes.

### 7.2 Editor interactions

- `/` opens the block insertion menu at an empty text position.
- A persistent add control is available between blocks for pointer and touch users.
- Blocks have a visible drag handle when hovered, focused, or selected.
- Keyboard users can move a selected block up or down through explicit commands.
- Deleting a populated or media block requires an undoable editor action, not a browser confirmation.
- Standard undo and redo cover content and block arrangement within the current session.
- Copy and paste preserve supported rich text while stripping unsupported styling and scripts.
- Dropping an accepted image between blocks inserts it at that position.
- Dropping multiple images creates either individual image blocks or a gallery, chosen through a small post-drop prompt. The default is a gallery for more than one file.
- The editor displays an intentional empty state with insertion choices rather than a blank contenteditable region.

### 7.3 Initial block types

#### Rich text

Supports:

- Paragraphs.
- Headings levels 2 and 3. The journey title is the only level 1 heading.
- Bold, italic, and links.
- Ordered and unordered lists.
- Block quotes.
- Hard break and horizontal divider.

Does not initially support text color, font selection, arbitrary alignment, tables, raw HTML, or nested columns.

#### Photograph

Stores:

- Internal media asset ID.
- Layout name.
- Desktop crop or focal point.
- Optional mobile crop or focal point.
- Optional caption and alt-text overrides.
- Decorative flag only when an image genuinely conveys no content.

The block inspector shows the original, current crop, intrinsic dimensions, file format, usages, and a replace action. Replacing an image changes the placement reference; it does not overwrite the old media asset.

#### Gallery

Stores an ordered list of media placements and one supported template. Each item retains its own crop and optional caption override.

Initial templates:

- Two equal columns.
- One large plus two small.
- Three-column contact sheet.
- Vertical sequence.

All gallery templates collapse to a deliberate mobile stack or swipe sequence. Reordering gallery items is separate from moving the gallery block.

#### Story step

Preserves the existing narrative pattern in which prose advances a corresponding image or video in the desktop media panel and displays media inline on mobile.

Stores:

- Rich text content.
- One media placement.
- Optional location checkpoint reference for future use.

This block is required for faithful migration of current `<Step>` MDX content.

#### Quote, heading, and divider

These are semantic blocks with fixed site styling. They do not expose arbitrary visual controls.

#### Video

Existing Cloudinary videos may be referenced and rendered during migration. New video upload, trim, poster-frame selection, and playback configuration are follow-up work.

### 7.4 Media inspector

Selecting a photograph opens an inspector with:

- Layout preset.
- Context preview: story, cover, card, or gallery item.
- Crop mode: original, focal fill, or manual rectangle.
- Aspect ratio determined by the chosen context, with an original-ratio option where supported.
- Zoom and focal-point controls.
- Desktop and mobile tabs.
- Caption.
- Alt text.
- Use asset defaults action.
- Reset crop action.

Desktop crop settings initially seed the mobile crop. A separate mobile crop is created only after the author changes it, avoiding unnecessary duplicate data.

### 7.5 Responsive preview

The editor toolbar offers desktop, tablet, and phone frames. These are useful while editing but are not the final verification surface.

The Preview action opens `/admin/preview/[journeyId]`, which:

- Uses the real read-only renderer and journey styles.
- Reads the current draft rather than the published revision.
- Supports resizable viewport presets.
- Is authenticated by default.
- Clearly labels the content as a draft.
- Disables indexing and caching as public content.

No preview URL is shared publicly in the initial release. Short-lived share links can be added later.

### 7.6 Autosave and conflicts

- Local editor state updates immediately.
- Autosave starts 1 second after the last change.
- Continuous editing still triggers a save at least every 10 seconds.
- A save sends the document, changed metadata, and the last known `editVersion`.
- The server updates only if `editVersion` still matches, then increments it.
- A mismatch returns HTTP 409 and never overwrites the newer draft.
- On conflict, editing is paused and the user can reload the server copy or export/copy the local unsaved JSON. Automatic merging is out of scope.
- Network failure retains local state in the browser session, displays `Retry needed`, and retries with backoff while the page remains open.
- The browser warns before leaving while an unsaved request remains.
- Full offline authoring across browser restarts is not included initially.

### 7.7 Revision history

- Autosave updates the mutable draft; it does not create a permanent revision for every keystroke.
- Create an immutable revision:
  - before each publish;
  - before restoring an older revision;
  - before a document-schema migration;
  - periodically while changes exist, no more than once every five minutes;
  - when the author explicitly creates a checkpoint.
- A revision records the document, relevant journey metadata, schema version, creation reason, and timestamp.
- Restoring a revision copies it into the current draft and increments `editVersion`. It does not alter the current public revision until republished.
- Retention policy is configurable. Initial behavior keeps all publish revisions and the most recent 50 non-publish revisions per journey.

### 7.8 Publication

Publication validation requires:

- Non-empty title.
- Unique valid slug.
- Summary or explicit confirmation that no summary is intended.
- A valid cover media placement.
- No pending or failed upload blocks.
- Every referenced media asset exists and is ready.
- Every meaningful image has asset-level or placement-level alt text.
- No unsupported or invalid document nodes.

Publishing performs one database transaction:

1. Re-read and validate the current draft.
2. Create an immutable publish revision.
3. Point `publishedRevisionId` at that revision.
4. Set status and publication timestamps.
5. Commit.
6. Revalidate the affected public journey, index, and sitemap routes.

If cache revalidation fails after the transaction, the publication remains valid and the operation reports a retryable delivery warning.

Unpublishing removes the public pointer or changes status without deleting revisions. Rollback republishes a selected prior publish revision through the same validation and transaction path.

## 8. Data model

All persisted structures require runtime validation and a `schemaVersion`. TypeScript types alone are not sufficient at API boundaries or migration inputs.

### 8.1 Journey document

```ts
type JourneyStatus = 'draft' | 'preview' | 'published' | 'archived';

type Journey = {
  _id: ObjectId;
  schemaVersion: 1;
  slug: string;
  title: string;
  summary?: string;
  status: JourneyStatus;
  draftDocument: JourneyDocument;
  cover?: MediaPlacement;
  experiencedAt?: {
    start: string;
    end?: string;
  };
  locations: JourneyLocation[];
  social?: {
    title?: string;
    description?: string;
    image?: MediaPlacement;
  };
  editVersion: number;
  publishedRevisionId?: ObjectId;
  firstPublishedAt?: Date;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;
};

type JourneyDocument = {
  schemaVersion: 1;
  editor: 'tiptap';
  content: TiptapJsonDocument;
};
```

The Tiptap schema is application-owned and versioned. Custom node attributes must use domain values such as `mediaAssetId`, layout names, and normalized crop data. They must not contain generated delivery URLs.

### 8.2 Journey revision

```ts
type JourneyRevision = {
  _id: ObjectId;
  journeyId: ObjectId;
  sequence: number;
  schemaVersion: 1;
  reason: 'periodic' | 'checkpoint' | 'pre-publish' | 'published' | 'pre-restore' | 'migration';
  document: JourneyDocument;
  metadataSnapshot: JourneyRevisionMetadata;
  createdAt: Date;
};
```

Revisions are immutable after insertion.

### 8.3 Media asset

```ts
type MediaAsset = {
  _id: ObjectId;
  schemaVersion: 1;
  provider: 'cloudinary';
  providerAssetId: string;
  providerPublicId: string;
  resourceType: 'image' | 'video';
  deliveryType: string;
  version?: number;
  originalFilename: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  checksum?: string;
  title?: string;
  caption?: string;
  altText?: string;
  tags: string[];
  captureDate?: string;
  privateMetadata?: {
    originalLocation?: GeoPoint;
    retainedExif?: Record<string, unknown>;
  };
  publicLocation?: PrivacySafeLocation;
  status: 'pending' | 'ready' | 'failed' | 'archived';
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;
};
```

`providerAssetId` is the immutable Cloudinary `asset_id`. `providerPublicId` is retained because Cloudinary delivery URLs currently use it. Only the media provider adapter may turn those values into URLs.

### 8.4 Media placement

```ts
type MediaPlacement = {
  mediaAssetId: string;
  role: 'cover' | 'card' | 'story' | 'gallery';
  layout: {
    desktop: 'inline' | 'wide' | 'full' | 'left' | 'right' | 'pair' | 'grid' | 'sequence' | 'story-step';
    mobile: 'inline' | 'full' | 'stack';
  };
  crop?: {
    desktop?: Crop;
    mobile?: Crop;
  };
  captionOverride?: string;
  altTextOverride?: string;
  decorative?: boolean;
};

type Crop = {
  mode: 'focal-fill' | 'manual';
  aspectRatio?: number;
  focalPoint?: { x: number; y: number };
  rect?: { x: number; y: number; width: number; height: number };
  zoom?: number;
};
```

All coordinates are normalized from `0` to `1`. Values outside that range fail validation.

### 8.5 Upload session

```ts
type UploadSession = {
  _id: ObjectId;
  idempotencyKey: string;
  intendedJourneyId?: ObjectId;
  status: 'created' | 'uploaded' | 'finalized' | 'failed' | 'expired';
  expectedResourceType: 'image';
  providerAssetId?: string;
  mediaAssetId?: ObjectId;
  createdAt: Date;
  expiresAt: Date;
};
```

Upload sessions close the consistency gap between a successful Cloudinary upload and a failed browser or database finalization request.

### 8.6 Required indexes

- Unique partial index on active journey `slug`.
- Journey index on `{ status: 1, updatedAt: -1 }`.
- Revision unique index on `{ journeyId: 1, sequence: 1 }`.
- Revision index on `{ journeyId: 1, createdAt: -1 }`.
- Media unique index on `{ provider: 1, providerAssetId: 1 }`.
- Sparse checksum index for duplicate lookup.
- Media search indexes for title, original filename, caption, tags, and capture date.
- Upload-session unique index on `idempotencyKey`.
- TTL index on expired, non-finalized upload sessions after a safe reconciliation window.

## 9. Media provider contract

Application code outside `lib/media/providers` depends on this boundary:

```ts
interface MediaProvider {
  createUploadAuthorization(intent: UploadIntent): Promise<UploadAuthorization>;
  inspectAsset(providerAssetId: string): Promise<ProviderAsset>;
  buildImageUrl(input: ImageDeliveryInput): string;
  buildVideoUrl(input: VideoDeliveryInput): string;
  listAssets(cursor?: string): Promise<ProviderAssetPage>;
  getOriginalExportReference(providerAssetId: string): Promise<ExportReference>;
}
```

Rules:

- UI components never concatenate Cloudinary URLs.
- Provider API credentials are server-only.
- Public rendering does not call the Cloudinary Admin API per request.
- The database contains enough provider metadata to construct normal delivery URLs.
- Image width requests are clamped to a finite supported set: `320`, `480`, `768`, `1024`, `1440`, and `1920` pixels.
- Quality and format use controlled defaults rather than arbitrary author input.
- Crop transformations are generated from normalized placement data.
- Transformation generation has unit tests with stable fixtures.

## 10. Upload workflow

### 10.1 Accepted initial media

- JPEG.
- PNG.
- WebP.
- HEIC/HEIF only after the spike verifies upload, metadata extraction, and preview behavior in the configured Cloudinary environment.

The upload preset and server validation define the maximum file size. The initial default should be conservative and configurable rather than embedded in editor code.

### 10.2 Signed direct upload

1. Authenticated client requests an upload authorization with filename, MIME type, byte size, and an idempotency key.
2. Server validates the request, creates an upload session, and returns short-lived signed Cloudinary parameters.
3. Client inserts a local object-URL placeholder and uploads directly to Cloudinary.
4. Client reports the provider response to the finalize endpoint.
5. Server verifies the response or re-fetches asset details using the provider adapter.
6. Server upserts the media asset by provider asset ID, finalizes the upload session, and returns the internal media ID.
7. Client replaces the temporary node with a persisted media node and revokes the local object URL.

The finalize operation is idempotent. Retrying it cannot create duplicate media records.

### 10.3 Failure states

- Validation failure: do not request a Cloudinary signature; show the exact unsupported property.
- Upload failure: keep the local placeholder with retry and remove actions.
- Finalize failure after upload: keep the provider result in memory and retry finalization before uploading again.
- Page closed after upload: reconciliation finds Cloudinary assets tagged with the upload-session ID.
- Duplicate checksum: warn and offer the existing media asset; do not silently discard the new upload.
- Orphan cleanup never immediately deletes provider assets. It produces a reviewable report first.

## 11. Authentication and authorization

Default implementation:

- Auth.js with GitHub OAuth.
- One configured GitHub account ID is the allowed author.
- Email may be displayed but is not the sole authorization key.
- Sessions use secure, HTTP-only cookies in production.
- Every admin page performs a server-side session check.
- Every admin API route independently performs the same authorization check.
- Upload signing, draft preview, migration triggers, exports, and publish actions are never public.
- Unauthorized API requests return 401; authenticated but disallowed identities return 403.

Required environment variables are documented in `.env.local.example` when implementation begins. Secrets must never use a `NEXT_PUBLIC_` prefix or appear in diagnostic logs.

## 12. API surface

Exact transport may use route handlers or server actions, but these domain operations remain explicit and independently testable.

### 12.1 Journeys

- `GET /api/admin/journeys`: list metadata with status, text query, cursor, and limit.
- `POST /api/admin/journeys`: create a draft.
- `GET /api/admin/journeys/[id]`: retrieve the editable journey.
- `PATCH /api/admin/journeys/[id]`: autosave metadata and document with expected edit version.
- `POST /api/admin/journeys/[id]/duplicate`: create an independent draft copy.
- `POST /api/admin/journeys/[id]/archive`: archive without deleting.
- `POST /api/admin/journeys/[id]/publish`: validate and publish.
- `POST /api/admin/journeys/[id]/unpublish`: remove from public rendering.
- `GET /api/admin/journeys/[id]/revisions`: list revision metadata.
- `POST /api/admin/journeys/[id]/revisions/[revisionId]/restore`: copy a revision to the draft.

### 12.2 Media

- `GET /api/admin/media`: search and paginate application media records.
- `GET /api/admin/media/[id]`: retrieve metadata and usage references.
- `PATCH /api/admin/media/[id]`: update author-owned metadata.
- `POST /api/admin/media/upload-authorizations`: validate and sign an upload intent.
- `POST /api/admin/media/finalize`: verify a provider upload and create the internal record.
- `POST /api/admin/media/reconcile`: administrator-only, explicit reconciliation run.

### 12.3 Response conventions

- Validation errors use HTTP 400 and include field-level issues.
- Authentication and authorization use 401 and 403.
- Missing records use 404.
- Autosave conflicts use 409 and include the current server edit version.
- Retryable provider or database failures use 502 or 503 with a stable application error code.
- Responses never expose database URIs, Cloudinary secrets, raw stack traces, or signed upload material beyond its intended short lifetime.

## 13. Public rendering and caching

- Public journey queries select by slug and a valid `publishedRevisionId`.
- Draft document fields are not returned to public clients.
- The published revision is runtime-validated before rendering.
- Media records are resolved in one batched query per journey, not one query per block.
- The renderer emits responsive `sizes` values that match each named layout.
- Below-the-fold media is lazy-loaded.
- Only likely above-the-fold media receives priority.
- Video does not use unconditional `preload="auto"` on mobile.
- Publishing, unpublishing, and rollback revalidate the affected journey and public indexes.
- Draft preview is dynamic, private, and marked `noindex`.

## 14. Accessibility requirements

- Every editor operation available by drag also has a keyboard alternative.
- Selected blocks and focus states are visible.
- Toolbars and inspectors have accessible names and logical tab order.
- Status changes such as saving, saved, upload failed, and publish errors are announced without stealing focus.
- Meaningful images require alt text before publication.
- Decorative images use an explicit decorative setting and empty alt text.
- Crop controls expose numeric or directional alternatives to pointer-only dragging.
- Public markup preserves heading order and semantic figures/captions.
- Reduced-motion preferences are respected in editor transitions and public story-step behavior.

## 15. Security and privacy requirements

- Keep Cloudinary API secret and MongoDB URI server-only.
- Use signed rather than unsigned production uploads.
- Constrain signature parameters, accepted resource types, size, and destination metadata server-side.
- Verify uploaded assets during finalization rather than trusting arbitrary client metadata.
- Sanitize supported rich text and reject unknown document nodes.
- Allowlist external URL protocols and future embed providers.
- Do not publish retained EXIF or precise GPS data by default.
- Strip sensitive request data from logs.
- Protect state-changing requests against cross-site request forgery through the selected session/action mechanism.
- Apply conservative rate limits to sign, finalize, publish, and reconciliation operations.
- Treat imported MDX as migration input, not trusted executable editor content.

## 16. Import, export, and migration

### 16.1 Cloudinary backfill

Create a resumable script that:

1. Enumerates existing Cloudinary image and video resources with pagination.
2. Upserts `media_assets` using immutable provider asset IDs.
3. Records current public IDs, versions, dimensions, formats, byte sizes, and selected metadata.
4. Reports duplicates, missing fields, and failures without deleting or renaming provider assets.
5. Can be re-run safely.

### 16.2 MDX journey migration

Create a dry-run-first converter for the supported current patterns:

- Journey `<h1>` becomes journey title metadata.
- `<Step media="...">...</Step>` becomes a story-step node.
- `kind="video"` preserves the video resource type.
- Supported Markdown/MDX prose becomes validated rich-text nodes.
- Media public IDs resolve through the backfilled media collection.
- Unknown components or unmatched media produce explicit blocking errors.

The script writes no database records unless an apply flag is supplied. Applied migrations create draft journeys first; publication remains a separate manual action.

### 16.3 Export format

Each journey export contains:

- `journey.md` with readable prose and stable media tokens.
- `journey.json` with complete versioned structured content and metadata.
- `media.json` mapping internal media IDs to original filenames, checksums, provider identifiers, captions, alt text, and crop placements.
- A list of original export references or downloaded originals when the selected export mode requests them.

An export round-trip test must demonstrate that IDs, ordering, prose, captions, alt text, and crop metadata survive.

### 16.4 Cutover

1. Backfill media records.
2. Migrate one non-critical story as a draft.
3. Compare old MDX and new rendering at desktop and mobile sizes.
4. Publish the database revision while retaining the MDX file.
5. Monitor for missing media and rendering errors.
6. Repeat per journey.
7. Remove dynamic MDX fallback only in a later, explicit cleanup change.

## 17. Proposed code organization

```text
app/
  admin/
    layout.tsx
    sign-in/
    journeys/
    media/
    preview/[journeyId]/
  api/admin/
    journeys/
    media/
  stories/[slug]/
components/
  editor/
    JourneyEditor.tsx
    EditorToolbar.tsx
    BlockMenu.tsx
    MediaInspector.tsx
    CropEditor.tsx
    nodes/
  journey/
    JourneyRenderer.tsx
    blocks/
  admin/
lib/
  auth/
  db/
    collections.ts
    indexes.ts
  journeys/
    schemas.ts
    repository.ts
    revisions.ts
    publishing.ts
    export.ts
  media/
    schemas.ts
    repository.ts
    delivery.ts
    providers/
      MediaProvider.ts
      CloudinaryProvider.ts
scripts/
  backfill-cloudinary.ts
  migrate-mdx-journey.ts
```

Names may change during implementation, but provider integration, persistence, domain logic, rendering, and editor UI must remain separate concerns.

## 18. Testing strategy

### 18.1 Unit tests

- Runtime schema acceptance and rejection.
- Normalized crop validation.
- Cloudinary transformation generation for every layout/crop combination.
- Slug creation and validation.
- Publication validation.
- Editor JSON to public renderer mapping.
- MDX migration fixtures.
- Markdown and manifest export.

### 18.2 Integration tests

- Authorized and unauthorized admin operations.
- Create, save, conflict, publish, unpublish, restore, and rollback.
- Upload authorization parameter restrictions.
- Idempotent media finalization.
- Batched media resolution.
- Draft isolation from public queries.
- Revision immutability.
- Index creation and uniqueness behavior.

Cloudinary calls use a provider test double except for a manually invoked integration check against a designated test folder.

### 18.3 End-to-end tests

- Sign in as the configured author.
- Create a journey.
- Enter and format prose.
- Drop an image and observe upload completion.
- Reorder the image.
- Apply a layout and separate mobile crop.
- Preview desktop and mobile.
- Recover from a forced autosave failure.
- Detect a simulated two-tab conflict.
- Publish and verify the public page.
- Continue editing and verify the public page does not change.
- Roll back to the earlier publication.
- Export the journey.

### 18.4 Visual and accessibility checks

- Screenshot fixtures for every block and layout at representative desktop, tablet, and phone widths.
- Compare editor preview and public rendering.
- Keyboard-only pass through the primary authoring workflow.
- Automated accessibility checks on dashboard, editor, media dialog, preview, and public journey.
- Reduced-motion rendering check.

## 19. Operational requirements

- Add structured application error codes without logging secrets or full media metadata.
- Record publication, unpublication, rollback, restore, and reconciliation events.
- Track failed uploads and orphan counts.
- Audit Cloudinary storage, bandwidth, and transformation usage before and after migration.
- Use a bounded responsive width set to prevent transformation sprawl.
- Document database backup and original-media export procedures.
- Perform one restore drill before the editor becomes the only authoring path.
- Keep migration and export scripts resumable and idempotent.

## 20. Delivery milestones

### Milestone 0: foundation spike

Deliverables:

- Selected editor framework with recorded reasoning.
- Custom media node round trip.
- File drop placeholder replaced by a fake internal media ID.
- Shared read-only renderer proof.
- Markdown plus manifest export proof.

Acceptance:

- No provider URL is stored in the test document.
- Save, reload, render, and export preserve content and ordering.

### Milestone 1: schemas and provider boundary

Deliverables:

- Runtime schemas and repositories.
- Required MongoDB indexes.
- Cloudinary provider adapter.
- Read-only database journey renderer.
- Media backfill dry run.

Acceptance:

- A manually seeded draft renders correctly in private preview.
- Cloudinary URLs are constructed only inside the provider/delivery layer.

### Milestone 2: authentication and draft reliability

Deliverables:

- Protected admin shell.
- Journey dashboard and creation flow.
- Autosave with optimistic concurrency.
- Revision snapshots and restore.

Acceptance:

- Refresh, transient network failure, and two open tabs do not silently lose work.
- No draft endpoint is accessible anonymously.

### Milestone 3: media workflow

Deliverables:

- Signed direct uploads.
- Idempotent finalization.
- Searchable media library.
- Metadata editing, duplicate warning, and orphan report.

Acceptance:

- A new image can be uploaded, inserted, reused, and located without copying a Cloudinary identifier.
- Retrying finalization produces one internal asset.

### Milestone 4: visual editor

Deliverables:

- Initial block set.
- Block insertion, reordering, duplication, deletion, undo, and keyboard movement.
- Layout inspector.
- Shared public/editor rendering.

Acceptance:

- One existing MDX story can be recreated manually with equivalent narrative behavior.

### Milestone 5: crop and responsive preview

Deliverables:

- Placement-level focal and manual crops.
- Optional mobile overrides.
- Cover, card, story, and gallery context previews.
- Exact preview route and visual tests.

Acceptance:

- One original photograph can have distinct reversible desktop-cover and mobile-card compositions.

### Milestone 6: publishing and migration

Deliverables:

- Publication validation and transactions.
- Publish, unpublish, rollback, and cache revalidation.
- MDX migration dry run and apply flow.
- Export and restore documentation.
- Critical end-to-end coverage.

Acceptance:

- One existing story is migrated and verified.
- One new journey is authored, previewed, published, revised without draft leakage, rolled back, exported, and restored without editing source code.

## 21. Suggested implementation slices

Keep changes reviewable in this order:

1. Test infrastructure and runtime schemas.
2. Media provider interface and Cloudinary adapter.
3. Database repositories and indexes.
4. Read-only renderer and database-first public lookup.
5. Authentication and admin shell.
6. Journey dashboard and metadata editing.
7. Autosave, conflicts, and revisions.
8. Upload authorization and finalization.
9. Media library.
10. Editor spike promoted into the visual editor.
11. Crop controls and responsive preview.
12. Publishing and cache invalidation.
13. Backfill, migration, export, and restore.
14. End-to-end, visual, accessibility, and performance hardening.

Each slice should leave the existing public site usable and should avoid combining unrelated homepage redesign work with editor infrastructure.

## 22. Risks and mitigations

### Editor framework lock-in

Mitigation: version the document schema, constrain custom node types, validate persisted JSON, and maintain Markdown/manifest export.

### Cloudinary and MongoDB consistency

Mitigation: signed upload sessions, idempotent finalization, provider verification, and reviewable orphan reconciliation.

### Excessive responsive complexity

Mitigation: named layouts, limited breakpoints, inherited mobile crops, and one shared renderer.

### Transformation cost growth

Mitigation: fixed responsive widths, predictable transformations, usage audits, and no arbitrary author-entered transformation strings.

### Draft leakage

Mitigation: immutable published revisions, separate public queries, transaction-based publication, and integration tests.

### Migration rendering differences

Mitigation: migrate one story at a time, retain MDX fallback, create visual comparisons, and require manual publication.

### Accidental data loss

Mitigation: autosave visibility, optimistic concurrency, revision checkpoints, no automatic media deletion, exports, and a tested restore process.

## 23. Definition of done

The initial editor project is complete when all of the following are true:

- The configured author can securely access the admin area and no one else can access draft operations.
- A journey can be created, written, arranged, previewed, and published without editing repository files.
- Dragged images upload directly to Cloudinary and become application media records automatically.
- Stored journey content contains internal media IDs rather than Cloudinary URLs or paths.
- Crops are reversible and can differ between desktop and mobile placements.
- The preview and public page use the same renderer.
- Autosave failures and edit conflicts are visible and never silently overwrite work.
- Published content remains unchanged while its draft is edited.
- A prior published revision can be restored.
- At least one existing MDX story is migrated with verified desktop and mobile output.
- The journey and its media metadata can be exported and restored.
- Critical unit, integration, end-to-end, visual, and accessibility checks pass.
- Cloudinary usage and archive recovery procedures are documented.

## 24. Defaults that may be revisited

Unless implementation evidence shows otherwise, begin with:

- Tiptap as the editor framework.
- Auth.js plus GitHub OAuth for single-author authentication.
- MongoDB for canonical content and revisions.
- Cloudinary for original media and delivery.
- `/stories/[slug]` as the public journey URL during migration.
- Constrained layout presets rather than free positioning.
- Image upload first, with existing-video rendering but new video authoring deferred.
- Authenticated preview rather than public share links.

Changing one of these defaults should update this document with the decision and its migration impact before implementation diverges.
