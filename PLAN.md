# Held Places Journey Template: Active Implementation Plan

Status: Active implementation contract
Last updated: 2026-09-20

## 1. Goal

Make `held-places` the site-wide visual system for the public journey index and individual journey pages, and make that presentation available through a locked, fill-in-the-slots editor.

The author should choose text and photographs, arrange chapters and image order, preview the result, and publish without editing CSS, selecting layout presets, or managing Cloudinary paths. Typography, spacing, responsive behavior, carousel behavior, and page composition belong to the template.

The visual references are:

- Laptop: `public/journey-screenshots/laptop/held-places.png` at 1440 × 900.
- Mobile: `public/journey-screenshots/held-places.png` at 390 × 844.

These screenshots define the intended tone and proportions: fixed Yuji branding, warm cream paper, restrained sans-serif supporting text, large serif titles, generous negative space, and photography held beside prose on wide screens.

## 2. Current baseline

The repository already provides the foundation this work must extend:

- Versioned journey, revision, media, placement, crop, and upload-session schemas backed by MongoDB repositories and indexes.
- Application-owned media IDs behind a Cloudinary provider boundary.
- GitHub-authenticated, single-author admin routes and APIs.
- Journey creation, metadata editing, debounced autosave, optimistic concurrency, and visible conflict handling.
- Signed image upload, idempotent finalization, reusable media records, metadata editing, and guarded media deletion.
- A Tiptap writing canvas with photograph and gallery nodes, focal-point controls, and direct file drop or paste.
- A shared journey renderer, authenticated desktop/mobile preview, database-first public journey lookup, and allowlisted MDX fallback.
- Publication validation, immutable published revisions, and draft isolation from the live journey.
- Unit coverage and a Playwright authoring flow for create, upload, publish, revise, view, and delete.

At the start of this plan, the unit suite contains 50 passing tests and `npm run typecheck` passes. The existing uncommitted compatibility changes in `lib/journeys/schemas.ts` and `tests/journeys/revisions.test.ts` are user work and must be preserved.

## 3. Active product contract

### 3.1 Public index

The root page becomes a server-rendered Held Places index backed by published journey revisions.

- The header displays the fixed site identity `Yuji / 佑治` and an `Index` link.
- The hero automatically uses the journey with the newest `publishedAt` value.
- The hero draws its title, summary, cover image, and destination URL from the immutable published revision.
- `Newest journey` and `Enter the journey →` are template copy, not author fields.
- Remaining published journeys appear in reverse publication order below the hero.
- Archive rows use the journey title and summary; their visual markers come from a template-owned restrained palette rather than author-selected CSS.
- Draft, preview, archived, and unpublished journeys never appear.
- The page has intentional loading-independent empty and failure states; it must not fall back to the current client-side loading screen or raw Cloudinary gallery.

The index should switch only after the intended existing public journeys have sufficient title, summary, cover, and publication metadata. Until then, the current public entry points remain available.

### 3.2 Journey page

Every Held Places journey uses the same shell and responsive design language as the index.

- The page starts with the fixed site header and a template-composed hero using title, summary, cover, and optional experienced date/location metadata.
- The body is an ordered sequence of repeatable chapters.
- A chapter contains an optional heading, restricted rich text, and one or more ordered photographs.
- On laptop, chapter text occupies the left column and the photograph or carousel occupies the right column.
- On mobile, chapter text appears first and media follows in a full-width frame.
- Authors cannot select fonts, colors, offsets, columns, arbitrary alignment, breakpoints, or CSS classes.
- Captions, meaningful alt text, decorative intent, and focal-point data remain author-controlled content rather than visual styling.

### 3.3 Chapter media and carousel

- One chapter image renders as a static template image without carousel chrome.
- Two or more images render in their saved order as one stable-size carousel.
- Laptop carousels expose previous and next controls, keyboard arrow navigation when focused, and a quiet current/total indicator.
- Mobile carousels use touch swiping and scroll snapping with a position indicator but no visible arrow controls.
- Carousels are always manual. They never autoplay or advance on a timer.
- Navigation does not wrap from the final image to the first.
- The current image and a bounded adjacent set may load eagerly; later images must be lazy-loaded to avoid charging mobile readers for unseen media.
- Slide changes preserve focus, provide an accessible status update, and respect reduced-motion preferences.
- Each image retains its own alt text, caption override, and optional desktop/mobile focal point.

### 3.4 Authoring experience

New journeys open with the `held-places-v1` template and one empty chapter already present.

The editor exposes:

- Fixed metadata fields for title, slug, summary, cover, optional experienced date, and optional location labels.
- Chapter controls to add, remove, duplicate, and reorder chapters.
- A constrained text field for paragraphs, bold, italic, and safe links; the separate chapter heading field owns heading structure.
- Media controls to upload or select one or more photographs, reorder them, remove them from the chapter, and edit alt text, caption overrides, and focal points.
- No layout dropdowns, gallery-template dropdowns, font controls, or raw CSS controls for Held Places documents.
- Inline desktop and mobile preview using the exact public shell and renderer.
- Existing autosave, conflict, upload, validation, and publication feedback.

An empty template is visually instructional: labels and placeholders explain what belongs in each slot without becoming saved public content.

## 4. Document and service interfaces

### 4.1 Versioned document union

The persisted `draftDocument` and revision `document` become a discriminated union. Existing version 1 Tiptap documents remain valid and render through the legacy structured renderer.

```ts
type JourneyDocument = LegacyTiptapDocumentV1 | HeldPlacesDocumentV2;

type HeldPlacesDocumentV2 = {
  schemaVersion: 2;
  template: 'held-places-v1';
  chapters: HeldPlacesChapter[];
};

type HeldPlacesChapter = {
  id: string;
  heading?: string;
  body: RestrictedRichTextDocument;
  media: HeldPlacesMedia[];
};

type HeldPlacesMedia = {
  mediaAssetId: string;
  crop?: {
    desktop?: TemplateCrop;
    mobile?: TemplateCrop;
  };
  captionOverride?: string;
  altTextOverride?: string;
  decorative?: boolean;
};
```

Rules:

- Chapter IDs are stable application IDs used for editing and reordering, not presentation.
- Restricted rich text supports paragraphs, hard breaks, bold, italic, and allowlisted links only.
- Chapter media deliberately omits layout names, CSS classes, coordinates, and arbitrary styles.
- The renderer derives all placement behavior from `template` and image count.
- Cover placement remains journey metadata and uses template-defined desktop/mobile treatment.
- Revisions snapshot the complete document and template-relevant metadata without changing public revision semantics.

### 4.2 Creation and editing APIs

- `POST /api/admin/journeys` creates a version 2 Held Places draft by default.
- `PATCH /api/admin/journeys/[id]` accepts and validates either legacy v1 or Held Places v2 documents during migration.
- Existing optimistic concurrency remains mandatory for template and metadata changes.
- Publication validation for v2 requires a title, summary, valid cover, at least one meaningful chapter, ready media references, and alt text or explicit decorative intent for every image.
- API responses continue to serialize application media IDs and normalized crop data, never provider URLs.

### 4.3 Published index reads

Add a repository query that returns only lightweight published summaries:

```ts
type PublishedJourneySummary = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  cover: HeldPlacesMedia;
  publishedAt: string;
  experiencedAt?: { start: string; end?: string };
  locations: JourneyLocation[];
};
```

The query must resolve metadata from the selected immutable revision, sort by `publishedAt` descending, paginate or cap results explicitly, and batch-resolve only the referenced cover media.

### 4.4 Rendering dispatch

Admin preview and `/stories/[slug]` dispatch by document version:

- v1 documents continue through the existing `JourneyRenderer`.
- v2 documents render through the shared Held Places page, chapter, and carousel components.
- Editor preview and public rendering use the same v2 components and CSS.
- The public route continues to read only `publishedRevisionId`; editing a v2 draft cannot change the live v1 or v2 page.

## 5. Migration and compatibility

Migration is explicit and author-assisted rather than an automatic content conversion.

### Existing database journeys

1. The author chooses `Start Held Places migration` from a legacy journey.
2. The server creates an immutable pre-migration checkpoint of the current draft.
3. The mutable draft becomes a new Held Places document with one empty chapter; the current published revision remains untouched.
4. The author manually places existing prose and photographs into the new slots and previews both widths.
5. Publishing creates a v2 revision and atomically moves the public pointer only after validation passes.

### Existing MDX journeys

1. Create a database draft using the existing public slug and Held Places template.
2. Manually copy and curate the title, summary, cover, chapters, and media references.
3. Keep the allowlisted MDX route live while the database journey remains a draft.
4. Publish the database journey only after visual comparison; database-first routing then performs the cutover.
5. Retain the MDX source and fallback until every intended migration is verified in a later cleanup change.

Migration actions must be idempotent or protected against accidental repeated initialization, and must never rewrite an immutable published revision.

## 6. Delivery stacks

Follow the repository rule that each PR changes one aspect. The contract stack is the shared prerequisite; the next four stacks may proceed in parallel after it lands.

### Stack 0 — Template contract (prerequisite)

Deliver:

- The v1/v2 document union and default Held Places document factory.
- Runtime validation for chapters, restricted rich text, and layout-free media references.
- Collection, serialization, revision, media-reference, and publication-validation support for both versions.
- Compatibility fixtures proving historical v1 drafts and revisions remain readable.

Exit condition: a v2 document can be created, saved, revised, validated, and reloaded without affecting v1 behavior.

### Stack 1A — Public Held Places design system

Deliver:

- Shared header, hero, journey shell, chapter, archive-row, and responsive style components.
- Template-owned typography, palette, spacing, breakpoints, crop ratios, and focus states.
- Single-image chapter rendering and intentional empty/error states.

Exit condition: static fixture data matches the reference composition at 1440 × 900 and 390 × 844 without page-specific CSS.

### Stack 1B — Locked template editor

Deliver:

- Fixed metadata and chapter slot UI.
- Restricted rich-text editing.
- Chapter add, duplicate, remove, and keyboard/pointer reorder controls.
- Multi-select media insertion, upload reuse, image ordering, metadata overrides, and focal controls.
- Removal of layout and gallery-template choices from v2 authoring while leaving v1 editing available during migration.

Exit condition: a new journey can be fully authored without viewing or editing presentation settings.

### Stack 1C — Responsive media carousel

Deliver:

- A reusable carousel driven by ordered Held Places media references.
- Desktop click controls, keyboard navigation, current/total status, and focus handling.
- Mobile swipe and scroll-snap behavior without visible arrows.
- Manual-only playback, reduced-motion behavior, responsive crops, and bounded lazy loading.

Exit condition: one-image and multi-image chapters behave correctly with mouse, keyboard, touch, and assistive technology.

### Stack 1D — Published index data and homepage

Deliver:

- Published summary query and batched cover resolution.
- Server-rendered newest-journey hero and remaining-journeys archive.
- Correct empty, unavailable-media, and database-failure treatments.
- Removal of the root page's client fetch, loading flash, raw story list, and uncurated asset feed when cutover criteria are met.

Exit condition: the homepage displays only immutable published data in Held Places presentation and links to working public journeys.

### Stack 2 — Integration

Deliver:

- Version-aware editor, preview, publish service, and public route dispatch.
- Journey hero metadata, page metadata, canonical URLs, and social image handling.
- V2 publication validation for meaningful content, media readiness, and accessibility text.
- Batch media resolution and cache/revalidation behavior for the homepage and journey routes.

Exit condition: a v2 draft previews identically to its published revision, and later draft edits do not leak publicly.

### Stack 3 — Manual migration workflow

Deliver:

- Pre-migration checkpoint and guarded `Start Held Places migration` action.
- Clear migration state and instructions in the editor.
- One verified database-v1 migration and one verified MDX migration before broader rollout.
- A cutover checklist that keeps fallback rendering until each journey passes desktop/mobile review.

Exit condition: legacy content can move to the template without downtime or destructive conversion.

### Stack 4 — Hardening

Deliver:

- Visual regression fixtures for the public index, journey hero, static chapter, and carousel chapter at both reference sizes.
- Keyboard and screen-reader passes for editor and reader interactions.
- Responsive loading checks for covers and carousels.
- Expanded end-to-end coverage of template authoring, multiple images, preview, publication, draft isolation, and migration.

Exit condition: all automated and manual acceptance checks pass and the template can become the default authoring path.

## 7. Verification matrix

### Schema and service tests

- Historical v1 documents and revisions still parse and render.
- New drafts contain `held-places-v1` and one empty chapter.
- V2 chapters preserve stable IDs, text, image order, captions, alt text, and crops through save and revision round trips.
- Unknown rich-text nodes, CSS/layout properties, and provider URLs are rejected.
- Publication rejects empty journeys, missing covers, unavailable media, and inaccessible meaningful images.
- Published summary queries exclude every non-published state and use revision metadata.

### Component and interaction tests

- One image renders without navigation controls.
- Multiple images retain order and expose correct boundaries and position status.
- Desktop buttons and arrow keys move one slide without wrapping.
- Mobile supports swipe/scroll snap without visible arrows or autoplay.
- Caption, alt text, decorative state, and focal points follow the active image.
- Removing or reordering media updates autosaved content without changing the live revision.

### Visual and accessibility checks

- Compare index and journey fixtures at 1440 × 900 and 390 × 844 with the Held Places references.
- Compare authenticated preview and public rendering from the same fixture.
- Verify visible focus, logical headings, named controls, status announcements, reduced motion, color contrast, and non-pointer operation.
- Confirm no horizontal page overflow outside the intentional mobile carousel scroller.

### End-to-end scenarios

- Create a preloaded journey, fill metadata, add chapters, select/upload multiple images, reorder content, and preview both widths.
- Publish, verify index placement and the public page, edit the draft, and verify the live revision remains unchanged until republished.
- Migrate a legacy database journey while its current published revision remains live.
- Prepare and publish an MDX-backed slug while the fallback remains available until cutover.
- Verify public 404 behavior and that drafts never appear in the index.

## 8. Definition of done

This project is complete when:

- The root index and v2 journey pages share the Held Places visual system at both reference sizes.
- New journeys start with the locked template and can be authored without CSS or layout decisions.
- Chapter media supports either a static image or the specified responsive manual carousel.
- Editor preview and public output use the same components and presentation rules.
- Publication remains immutable and draft-safe.
- Legacy v1 and MDX pages remain readable until explicitly migrated.
- At least one database journey and one MDX journey have completed manual migration and review.
- Unit, type, end-to-end, visual, performance, keyboard, and accessibility checks pass.

## 9. Out of scope

The active template project does not include revision-history UI, rollback/unpublish/archive/duplicate controls, bulk export or restore, automatic MDX conversion, video authoring, maps, Instagram import, real-time collaboration, arbitrary page layout, or additional visual templates. Those belong in `FUTURE_TASKS.md` and should move into this plan only when actively scheduled.
