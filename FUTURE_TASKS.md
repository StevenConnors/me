# Future Tasks and Product Direction

Last updated: 2026-09-18

This document captures future product and engineering directions for the site. It is a roadmap and decision log, not a commitment to implement everything immediately.

## North star

Build a personal, durable archive of journeys: a place for photographs, travel writing, short observations, and the context connecting them.

The site should be able to preserve the parts of a journey that are difficult to express on Instagram. A journey may be a full essay, a mostly visual sequence, or something in between. It should remain useful even if a social platform or third-party media service disappears.

## Product principles

- **A journey is the primary unit of content.** Stories, photographs, videos, notes, and map locations belong to a journey rather than living as unrelated feeds.
- **Writing and publishing should feel direct.** The author should not need to remember Cloudinary paths, edit JSX, or manually coordinate files across services.
- **Drafts and published work are different states.** Incomplete experiments should remain privately previewable until they are ready.
- **Curation is part of the work.** The homepage and gallery should present intentional selections rather than exposing the latest storage assets.
- **Original media is archival; crops are presentation.** Never destructively crop the only original. Store focal point, zoom, and aspect-ratio choices as reversible settings for each placement.
- **Mobile performance is a core design constraint.** The site should remain pleasant on a phone and economical on cellular data.
- **Infrastructure should be replaceable.** The public experience and editor should deal in human titles and stable asset IDs, not storage-provider URLs.
- **Content must remain portable.** A future editor should be able to export journeys and metadata to an open, readable format such as Markdown/MDX plus JSON.
- **Keep the ongoing monetary cost at or near zero.** Free tiers and operational simplicity matter, but not at the expense of losing the archive.

## Proposed content model

### Journey

A journey should support:

- Title, slug, summary, cover image, and optional introductory text.
- Experienced date or date range, written/published date, and one or more locations.
- Status: `draft`, `preview`, `published`, or `archived`.
- An ordered sequence of content blocks.
- Optional map route and geographic checkpoints.
- Per-journey social metadata and sharing image.
- Previous and next journey relationships.
- A photo-first mode that does not require a complete essay.

Possible block types:

- Rich text.
- Photograph.
- Photograph group or gallery.
- Video.
- Map checkpoint or route transition.
- Quote or short observation.
- Divider or chapter heading.
- External embed, used sparingly.

### Media asset

The application should maintain its own media record instead of making a Cloudinary path the identity of a photograph.

A media record may contain:

- Stable internal ID.
- Original filename and provider storage key.
- Capture date, upload date, location, and retained EXIF metadata.
- Human title, caption, alt text, and tags.
- Original dimensions and media type.
- Journey associations and usage references.
- Optional privacy-safe location override.
- Crop settings per placement, such as `cover`, `card`, `gallery`, and `story`.

Crop settings should be non-destructive and store values such as:

- Focal point (`x`, `y`).
- Zoom or crop scale.
- Target aspect ratio.
- Optional manual crop rectangle.

## Roadmap

### 1. Content foundation and publishing states

- [ ] Define the final Journey and Media Asset schemas before building the editor.
- [ ] Add explicit draft, preview, published, and archived states.
- [ ] Prevent unfinished proof-of-concept stories from appearing in public indexes.
- [ ] Decide where the canonical content lives: Git, a database, or a hybrid model.
- [ ] Require a portable export regardless of the canonical authoring store.
- [ ] Plan a migration path for the existing MDX stories and Cloudinary assets.
- [ ] Add validation for missing titles, descriptions, media, dates, and accessibility text before publication.
- [ ] Decide whether short “thoughts” are their own content type or lightweight blocks/journeys.

### 2. Private visual editor and admin area

- [ ] Add a securely authenticated, single-author admin area.
- [ ] Create a journey dashboard with clear draft and published sections.
- [ ] Build a block-based editor for prose, photographs, video, galleries, and map checkpoints.
- [ ] Support drag-and-drop block ordering.
- [ ] Add a faithful desktop and mobile preview before publishing.
- [ ] Add autosave, revision history, and recovery from accidental edits.
- [ ] Allow publishing, unpublishing, duplicating, and archiving journeys.
- [ ] Provide a searchable media library with upload, metadata editing, and journey usage information.
- [ ] Hide provider URLs and storage paths from the normal authoring workflow.
- [ ] Add an in-browser crop tool with focal-point and zoom controls.
- [ ] Preview each crop in the contexts where it will appear: homepage, cover, gallery, and story.
- [ ] Allow a location or map checkpoint to be attached to each relevant block.
- [ ] Preserve an advanced/raw Markdown view or import/export route for portability and recovery.

### 3. Curated public experience

- [ ] Replace the homepage’s raw story list and asset feed with a curated front page.
- [ ] Feature one current journey with a strong image, place/date, and short introduction.
- [ ] Show a restrained list of other published journeys.
- [ ] Select a small set of photographs for the homepage rather than displaying the first storage results.
- [ ] Support photo-first journeys alongside essay-first journeys.
- [ ] Add previous and next journey navigation.
- [ ] Add a browse-all journeys view with useful place and date context.
- [ ] Replace technical photo titles and Cloudinary paths with human metadata.
- [ ] Decide whether standalone photo pages add value or whether photographs should primarily live inside journeys.
- [ ] Use original aspect ratios or an editorial masonry layout where appropriate.
- [ ] Keep maps, screenshots, tickets, and similar documentary artifacts within their journey unless intentionally featured.

### 4. Geographic storytelling

- [ ] Define a route/checkpoint data model independent of any one map provider.
- [ ] Let each story block optionally advance the current location.
- [ ] Create a map treatment that makes the reader’s current geographic position immediately understandable.
- [ ] Prototype animated pin and route transitions from point A to point B as the story advances.
- [ ] Design separate desktop and mobile map behaviors; avoid covering prose or requiring precise gestures.
- [ ] Provide reduced-motion and non-animated fallbacks.
- [ ] Decide how to handle journeys with approximate, unknown, or intentionally private locations.
- [ ] Strip or reduce precise GPS data where publishing it would expose sensitive locations.
- [ ] Research map rendering and tile options against the zero-cost constraint before choosing a provider.

### 5. Instagram and long-term archival workflow

- [ ] Treat Instagram as an optional publishing/ingestion channel, not the canonical archive.
- [ ] Research importing a user-requested Instagram data export rather than scraping the live account.
- [ ] Preserve original captions, timestamps, media order, and available metadata during import.
- [ ] Import material privately by default so it can be curated into journeys before publication.
- [ ] Detect duplicate media using stable hashes rather than filenames alone.
- [ ] Support a full archive export containing content, metadata, and a manifest of original media.
- [ ] Define a backup process for original photographs separate from transformed delivery copies.
- [ ] Document how the archive can be restored if a storage or hosting provider disappears.

### 6. Media storage and delivery research

Current hypothesis: Cloudinary may still be a reasonable delivery backend. Much of the current pain comes from exposing its folder paths directly in the authoring and public interfaces. Build a provider-neutral media layer before deciding whether migration is necessary.

- [ ] Audit current media volume, monthly bandwidth, transformation usage, and expected growth.
- [ ] Confirm current free-tier limits at the time of the decision; pricing and quotas can change.
- [ ] Compare keeping Cloudinary with object-storage-based and repository-backed alternatives.
- [ ] Score options by minimum monthly cost, storage, bandwidth/egress, image transformations, video support, upload APIs, reliability, and exportability.
- [ ] Avoid storing large originals directly in the Git repository unless an audit shows the collection will remain very small.
- [ ] Introduce a `MediaProvider` boundary so the application stores stable internal IDs and can replace the delivery service later.
- [ ] Ensure original assets can be bulk-exported without reconstructing provider-specific URLs by hand.
- [ ] Separate the original archive from generated thumbnails and delivery derivatives.

### 7. Performance, resilience, and quality

- [ ] Fix or temporarily hide the broken “thoughts aloud” page; its API currently returns HTTP 500.
- [ ] Add useful error and empty states instead of persistent loading indicators.
- [ ] Server-render or pre-render public indexes where possible to reduce loading flashes.
- [ ] Lazy-load below-the-fold images and video.
- [ ] Replace mobile video `preload="auto"` with a conservative strategy and poster frames.
- [ ] Avoid autoplaying or preloading many videos simultaneously on cellular connections.
- [ ] Generate responsive image sizes appropriate to their actual placement.
- [ ] Measure real mobile loading performance before and after media changes.
- [ ] Add per-journey page titles, descriptions, and social preview images.
- [ ] Improve alt text and hide purely decorative progress indicators from assistive technology.
- [ ] Add visible keyboard focus states and verify basic keyboard navigation.
- [ ] Add automated checks for broken media references and unpublished draft leakage.

### 8. Editorial and interaction polish

- [ ] Add a short deck or introduction beneath journey titles when useful.
- [ ] Present experienced, written, and published dates as intentional metadata.
- [ ] End journeys with a quiet credit such as “Words and photographs by Yuji.”
- [ ] Add a lightweight copy-editing pass without sanding away the personal voice.
- [ ] Iterate on the vertical dash progress indicator rather than assuming it must be removed.
- [ ] Compare the current indicator with a chapter count, labeled checkpoints, and a minimal no-indicator version.
- [ ] Standardize “thoughts aloud” versus “thoughts out loud.”
- [ ] Consider “Photographs” as a more editorial navigation label than “Photo Gallery.”
- [ ] Consider a custom domain once the public structure feels settled.

## Open architectural decisions

These decisions should be made before significant editor work begins:

1. **Canonical storage:** Should a publish action create versioned MDX in Git, update a database, or do both?
2. **Editor framework:** Use an established rich-text/block editor or build only the small set of blocks this site needs?
3. **Media ownership:** Where do archival originals live, and where do optimized delivery copies live?
4. **Map provider:** Which renderer, route format, and tile source meet the visual, privacy, and zero-cost requirements?
5. **Thoughts:** Are they a separate stream, small journeys, or reusable note blocks?
6. **Photo pages:** Should every asset have a public page, or only curated photographs and journeys?
7. **Publishing workflow:** Is private preview-by-URL sufficient, or is a fuller review state useful?

## Implementation sketch: visual journey editor and media workflow

This is the recommended working direction, not a final technology lock-in. The first implementation should prove the complete authoring loop with one existing journey before expanding the editor's block library.

### Recommended architecture

- **MongoDB is the canonical authoring store.** Store journey metadata, the versioned editor document, publication state, and internal media records there. Do not store image or video binaries in MongoDB.
- **Cloudinary remains the first media origin and delivery provider.** It already holds the site's media and provides direct uploads, transformations, responsive delivery, and a CDN. Re-evaluate it after measuring real storage, bandwidth, and transformation usage rather than migrating preemptively.
- **Git is an export and recovery target, not the runtime write path.** A publish or export job should be able to create Markdown/MDX plus JSON manifests, but a deployed web process should not have to commit to the repository in order to save a draft.
- **Use a provider-neutral media boundary.** Journey documents contain the application's `mediaAssetId`, never a Cloudinary URL or folder path. The media record maps that ID to Cloudinary's immutable `asset_id`, current `public_id`, resource type, version, and delivery metadata.
- **Use a structured block document instead of storing rendered HTML.** Version the document schema from the beginning and provide explicit import/export adapters. Rich-text output must be sanitized and raw HTML should be excluded from the initial editor.
- **Build a constrained responsive layout system, not a free-positioning canvas.** Useful presets such as inline, wide, full-bleed, portrait pair, two-column gallery, and horizontal sequence will produce better mobile results than arbitrary pixel placement. Each block can define a desktop presentation and a deliberate mobile fallback.
- **Use the same rendering components for the editor, preview, and public journey.** Editor chrome may wrap those components, but the actual typography, spacing, crop, and responsive behavior should have one implementation.

### Editor framework direction

Tiptap is the current front-runner because it supports Next.js, JSON documents, custom React node views, draggable nodes, and file drop/paste hooks while leaving the visual design under application control. Its file handler deliberately does not implement storage, which fits the provider-neutral upload flow below.

Before committing, build a short prototype with the following exact test:

1. Edit rich text in the site's typography.
2. Drop an image between two paragraphs and replace its temporary preview with an internal `mediaAssetId` after upload.
3. Drag the image block to a new position.
4. Change it between inline, wide, and paired layouts.
5. Save JSON, reload it, and render the same document outside the editor.
6. Export the result to readable Markdown plus a media manifest.

Compare BlockNote only during this prototype. It supplies more block-editor interface out of the box, but either choice will still require custom media nodes, crop controls, responsive layout rules, and the site's public renderer. Choose the smaller amount of custom code after the prototype rather than choosing from generic editor demos.

### Proposed data ownership

#### `journeys`

Store the current editable document and the metadata needed by dashboards and public indexes:

```ts
type Journey = {
  id: string;
  schemaVersion: number;
  slug: string;
  title: string;
  summary?: string;
  status: 'draft' | 'preview' | 'published' | 'archived';
  document: JourneyDocument;
  cover?: MediaPlacement;
  experiencedAt?: { start: string; end?: string };
  locations: JourneyLocation[];
  editVersion: number;
  publishedRevisionId?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
};
```

`editVersion` supports optimistic concurrency so an older browser tab cannot silently overwrite newer work. The dashboard should query only lightweight metadata, not every full editor document.

#### `journey_revisions`

Store immutable snapshots separately instead of growing an unbounded revision array inside a journey. Create a snapshot periodically, before destructive operations, and whenever a journey is published. `publishedRevisionId` points at the exact public version, so later draft edits cannot leak onto the live site.

#### `media_assets`

```ts
type MediaAsset = {
  id: string;                    // Stable application identity
  provider: 'cloudinary';
  providerAssetId: string;       // Cloudinary asset_id; immutable
  providerPublicId: string;      // Current delivery identifier
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
  location?: PrivacySafeLocation;
  status: 'pending' | 'ready' | 'failed' | 'archived';
  createdAt: string;
  updatedAt: string;
};
```

The upload response can also provide selected EXIF/IPTC/XMP metadata, but retain only fields that are useful and safe to publish. Precise GPS data should be private by default.

#### Media placement inside a journey document

Crop and layout belong to a placement, not to the original asset. The same photograph may need a landscape cover crop, a portrait mobile crop, and an uncropped story treatment.

```ts
type MediaPlacement = {
  mediaAssetId: string;
  role: 'cover' | 'story' | 'gallery' | 'card';
  layout: {
    desktop: 'inline' | 'wide' | 'full' | 'left' | 'right' | 'pair';
    mobile: 'inline' | 'full' | 'stack';
  };
  crop?: {
    desktop?: Crop;
    mobile?: Crop;
  };
  captionOverride?: string;
  altTextOverride?: string;
};

type Crop = {
  aspectRatio?: number;
  focalPoint?: { x: number; y: number }; // Normalized from 0 to 1
  rect?: { x: number; y: number; width: number; height: number };
  zoom?: number;
};
```

Normalized coordinates keep the record provider-neutral. The Cloudinary adapter translates them into delivery transformations; another provider could do the same later.

### Authoring experience

The smallest useful admin experience should support this path:

1. Sign in to `/admin` as the one allowed author.
2. Create a journey draft and edit its title, slug, summary, dates, and locations.
3. Type and format prose directly in the journey canvas.
4. Drag photographs into the canvas or choose them from the media library.
5. See an immediate local placeholder while each file uploads.
6. Reorder prose, image, gallery, divider, quote, and current story-step blocks with a drag handle.
7. Select an image to edit caption, alt text, layout preset, focal point, and optional desktop/mobile crops.
8. Toggle a desktop, tablet, or phone canvas while editing, then open an exact preview route before publishing.
9. Autosave without changing the currently published revision.
10. Run publication checks, publish atomically, and retain the previous published revision for rollback.

The preview should render the real public route in an authenticated or short-lived preview context, ideally in a resizable frame. Merely shrinking the editor canvas is not enough to verify responsive CSS.

### Upload and crop pipeline

1. The authenticated browser asks a Next.js server route for short-lived signed Cloudinary upload parameters. The Cloudinary API secret never reaches the browser.
2. The browser uploads directly to Cloudinary so the application server does not proxy large files.
3. The editor initially inserts a temporary block containing a local object-URL preview and upload progress.
4. After upload, the browser calls an idempotent finalize route. The server verifies or re-fetches the Cloudinary asset details, writes the `media_assets` record, and returns the stable internal ID.
5. The editor replaces the temporary block with `mediaAssetId` and autosaves the journey.
6. Failed uploads remain retryable. Successfully uploaded but unfinalized assets are marked or discovered as orphans and can be reconciled safely rather than deleted immediately.
7. Cropping never overwrites the original. The application stores crop/focal metadata on the placement and generates a derived Cloudinary URL at render time.

Cloudinary's upload widget can provide a useful initial file picker, but its upload-time crop is not the canonical crop tool: one asset needs multiple, reversible placement crops. Use an application-owned crop interface over the original and save normalized coordinates in MongoDB.

### Provider boundary

The rest of the application should depend on a narrow interface rather than calling Cloudinary throughout UI components:

```ts
interface MediaProvider {
  createUploadAuthorization(input: UploadIntent): Promise<UploadAuthorization>;
  inspectAsset(providerAssetId: string): Promise<ProviderAsset>;
  buildImageUrl(asset: MediaAsset, placement: MediaPlacement, width: number): string;
  buildVideoUrl(asset: MediaAsset, options: VideoDeliveryOptions): string;
  listAssets(cursor?: string): Promise<ProviderAssetPage>;
  exportOriginal(asset: MediaAsset): Promise<ExportReference>;
}
```

Only the Cloudinary adapter should know URL transformation syntax. Public components receive a media asset and presentation intent, not a provider path.

### Cloudinary evaluation

**Recommendation: keep Cloudinary for the first editor release, behind the provider boundary.** The present authoring pain is caused mainly by leaking `public_id` paths and URLs into MDX, not by a missing Cloudinary capability.

Reasons to keep it now:

- Existing assets and public rendering already use it, so this avoids a risky media migration before the editor proves itself.
- Its immutable `asset_id` remains stable if a `public_id` changes. Store both on the media record, but expose neither during normal writing.
- Signed direct browser uploads fit the private-admin flow and keep the API secret server-side.
- On-demand format, quality, resize, and crop transformations are a good fit for one original with multiple responsive placements.
- Originals and metadata can be enumerated and bulk-downloaded, which makes an exit path practical.

Risks and mitigations:

- **Usage-based limits:** As checked on 2026-09-18, the free Image and Video API plan includes 25 monthly credits. One credit can represent 1 GB managed storage, 1 GB image/video bandwidth on the free plan, or 1,000 transformations. Audit the actual dashboard before implementation and set usage alerts where available.
- **Transformation sprawl:** Arbitrary widths and crop strings can create many derivatives. Use a bounded set of responsive widths and named/predictable placement transformations.
- **Provider identity versus delivery identity:** `asset_id` is immutable, while delivery URLs use `public_id`. Keep the application's own ID in content and both provider fields in `media_assets`; refresh provider metadata when assets are renamed.
- **Backup coupling:** Provider backups are not a fully independent archive. Schedule a manifest plus original-media export to local/external storage. Treat a separate object-store backup as a later option if the archive or budget justifies it.
- **Two-system consistency:** A Cloudinary upload and MongoDB write cannot be one transaction. Use pending/finalized states, idempotency keys, and an orphan reconciliation job.
- **Vendor-specific transformations:** Keep crop/layout intent as normalized application data and generate provider transformations only inside the adapter.

Reconsider Cloudinary only if the measured collection outgrows the free/acceptable budget, video bandwidth dominates, required transformations are missing, or independent archival storage becomes more important than the integrated delivery workflow.

### Security and publication rules

- Protect all `/admin` pages, draft APIs, upload-signature routes, and preview endpoints with server-verified authentication. For a single author, allowlist one immutable account identity in addition to checking the email address.
- Validate MIME type, file size, dimensions, and resource type on both upload intent and finalization.
- Never expose `CLOUDINARY_API_SECRET` or `MONGODB_URI` to client code or logs.
- Sanitize rich-text output and initially allowlist external embed providers rather than permitting arbitrary HTML or scripts.
- Require title, slug, cover treatment, image alt text, and valid media references before publication.
- Public queries must resolve only `publishedRevisionId`; they must never render the mutable draft document.
- Publishing should update the published revision pointer and invalidate the affected Next.js pages only after all checks pass.

### Delivery phases

#### Phase 0: audit and editor spike

- Inventory existing MDX structures and every referenced Cloudinary `public_id`.
- Measure Cloudinary originals, storage, bandwidth, transformation count, videos, and current folder mode.
- Confirm MongoDB deployment, backup expectations, and indexes.
- Complete the Tiptap-versus-BlockNote prototype above and preserve it only if it passes the round-trip test.
- Decide the initial responsive layout presets; explicitly defer arbitrary positioning.

Exit condition: one throwaway document can edit, drop, reorder, save, reload, preview, and export an image plus prose without storing a Cloudinary URL in the document.

#### Phase 1: content and media foundation

- Add runtime-validated, versioned schemas for journeys, revisions, media assets, and placements.
- Add `MediaProvider` plus the Cloudinary adapter.
- Backfill `media_assets` by enumerating Cloudinary resources and matching existing public IDs.
- Add indexes for journey slug/status, updated date, provider asset ID, checksum, and media search fields.
- Build a read-only renderer for the new document schema before building the full editor.

Exit condition: a hand-authored database journey renders through the new public renderer on desktop and mobile.

#### Phase 2: private admin and reliable saving

- Add single-author authentication and protect server routes.
- Build the journey dashboard and journey metadata form.
- Add debounced autosave, optimistic concurrency, unsaved/error indicators, and manual retry.
- Add immutable revision snapshots and recovery.

Exit condition: refreshing, losing the network, or opening two tabs cannot silently lose or overwrite work.

#### Phase 3: uploads and media library

- Implement signed direct uploads, temporary editor placeholders, and idempotent finalization.
- Build the searchable media library and metadata editor.
- Add checksum-based duplicate warnings, upload retry, usage references, and orphan reconciliation.
- Add an original-media plus metadata export command before accepting the editor as canonical.

Exit condition: an author can drag in a new photo, see progress, reuse it elsewhere, and never copy a provider URL.

#### Phase 4: visual block editor

- Implement prose, photograph, gallery, video, quote, divider/heading, and existing scroll-linked story-step blocks.
- Add keyboard-accessible block insertion, selection, deletion, duplication, and drag ordering.
- Implement layout presets using the same components as the read-only renderer.
- Add Markdown import/export and a raw recovery view; do not make raw editing the normal workflow.

Exit condition: recreate one existing MDX journey with equivalent public behavior using only the admin interface.

#### Phase 5: crop and responsive preview

- Add non-destructive focal point, zoom, and crop rectangle controls per placement.
- Support separate desktop and mobile decisions only where a shared focal point is insufficient.
- Add cover, card, story, and gallery context previews.
- Add exact desktop/tablet/mobile preview routes and visual regression tests.

Exit condition: the same original can be intentionally composed for a wide desktop cover and narrow phone card without creating a second original.

#### Phase 6: publishing, migration, and hardening

- Add validation, preview, publish, unpublish, rollback, duplicate, and archive actions.
- Convert existing MDX in a dry run, report unmatched media, and compare old/new rendered journeys before switching routes.
- Keep the MDX renderer as a temporary fallback until every published journey has been verified.
- Add end-to-end tests for upload, autosave, reorder, crop, preview, publish, rollback, draft isolation, and export/restore.
- Add Cloudinary usage monitoring and a documented restore drill.

Exit condition: an existing journey has been migrated and a new journey has been authored, previewed, published, exported, and restored without editing source code.

### Explicit non-goals for the first release

- Real-time multi-author collaboration.
- Arbitrary desktop-canvas positioning or breakpoint-specific pixel coordinates.
- Destructive edits to original media.
- AI tagging, automatic layout, or complex Cloudinary add-ons.
- Writing commits directly from the production server.
- Deleting Cloudinary assets automatically when a block is removed; shared usage and recovery must be considered first.

### Research references checked for this sketch

- [Cloudinary pricing and credit model](https://cloudinary.com/pricing)
- [Cloudinary upload parameters and immutable asset IDs](https://cloudinary.com/documentation/upload_parameters)
- [Cloudinary signed uploads with Next.js](https://cloudinary.com/documentation/nextjs_image_and_video_upload)
- [Cloudinary upload widget crop behavior](https://cloudinary.com/documentation/upload_widget_reference#cropping_parameters)
- [Cloudinary asset download and export options](https://cloudinary.com/documentation/ts_how_can_i_download_my_accounts_assets)
- [Tiptap with Next.js](https://tiptap.dev/docs/editor/getting-started/install/nextjs)
- [Tiptap file drop and paste handling](https://tiptap.dev/docs/editor/extensions/functionality/filehandler)
- [Tiptap JSON storage and output](https://tiptap.dev/docs/guides/output-json-html)
- [MongoDB document model and size limit](https://www.mongodb.com/docs/manual/core/document/)

## Suggested sequencing when work resumes

1. Define Journey and Media Asset schemas.
2. Decide the canonical-storage and export strategy.
3. Fix current public breakage and add draft filtering.
4. Build the smallest useful admin editor around one existing journey.
5. Add the media library and non-destructive crop controls.
6. Redesign the homepage and public journey navigation using the new model.
7. Prototype geographic storytelling on a single journey.
8. Add Instagram import and broader archival tooling only after the core workflow is stable.

## Definition of success

The direction is working when:

- A journey can be created, edited, previewed, and published without touching source code or remembering a storage path.
- A journey can be primarily prose, primarily photographs, or a deliberate mixture of both.
- A reader can understand where they are geographically without the map distracting from the story.
- The homepage feels edited rather than automatically populated.
- Photographs retain their intended composition across desktop and mobile.
- A mobile reader does not pay the performance cost of media they have not reached.
- The complete archive can be exported and restored without depending permanently on any one vendor.
- Normal operation remains within the intended zero-cost or near-zero-cost budget.
