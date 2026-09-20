# Photo Gallery: Masonry, Infinite Loading, and Video Plan

Status: Ready for implementation
Last updated: 2026-09-20

> **Ordering and section-model update (2026-09-21):**
> `PHOTOS_WYSIWYG_EDITOR_PLAN.md` supersedes this document's date-derived
> canonical ordering and media-attached `photoSectionBreak` contract. Any later
> masonry, pagination, or video work from this plan must preserve the published
> block order defined by the WYSIWYG plan. Do not implement Sections 3.1, 3.2,
> or the ordering portions of Section 4 as written here.

## 1. Objective

Extend the existing public Photos tab and its dedicated admin editor into a mixed photo/video gallery that:

- keeps each photograph or video poster at its original aspect ratio;
- lays mostly vertical media out in a dense, four-column masonry/brick composition on desktop;
- remains ordered by capture date, with the most recent media first;
- preserves optional author-created section breaks, headings, and notes;
- server-renders a small first page and loads later pages as the reader approaches the bottom;
- never downloads video bytes merely because a video appears in the grid;
- loads and mounts video playback only after the reader opens that item;
- remains keyboard accessible, touch friendly, and usable when automatic infinite loading fails;
- continues to use application-owned media IDs and Cloudinary only through the existing media-provider boundary.

This document is intentionally explicit. An implementation agent should not need to infer product behavior or redesign the data flow.

## 2. Current implementation baseline

The following work already exists and must be preserved.

### 2.1 Media records

`lib/media/schemas.ts` defines `MediaAssetSchema`. It already supports:

- `resourceType: 'image' | 'video'`;
- provider identity and dimensions;
- `captureDate` as an optional `YYYY-MM-DD` string;
- `showInPhotos` as the explicit opt-in for the public Photos tab;
- `photoSectionBreak` with optional `title` and `text`;
- caption, alt text, tags, status, and timestamps.

The public gallery must continue to include only ready records with `showInPhotos: true`. Journey-only media must not appear automatically.

### 2.2 Admin Photos editor

`app/admin/(protected)/photos/page.tsx` and `PhotosWorkspace.tsx` currently provide:

- multiple-file image selection;
- sequential upload and finalization;
- automatic Photos-tab opt-in after upload;
- a file-modified-date starting value for `captureDate`;
- per-item capture date, caption, alt text, and section-break editing;
- removal from Photos without deleting the reusable media record.

The editor currently accepts image MIME types only. Its naming and messages are photo-specific and must be updated when video support lands.

### 2.3 Public Photos page

`app/photos/page.tsx` currently:

- calls `MediaRepository.listPhotos()` on the server;
- maps all returned records to public presentation data;
- renders `PhotosGallery`;
- builds one 1440-pixel Cloudinary image URL per photograph.

`components/photos/PhotosGallery.tsx` currently:

- receives the complete item array as a prop;
- groups items around `photoSectionBreak` markers;
- renders a four-column CSS grid on large screens;
- preserves source aspect ratios;
- opens a keyboard- and touch-navigable lightbox.

This is not infinite loading. `listPhotos()` currently returns up to 200 image records, so all metadata is loaded into the initial response. `next/image` defers many image requests, but it does not solve database/API pagination.

### 2.4 Existing video infrastructure and gaps

The provider layer already contains useful video pieces:

- `MediaAssetSchema` accepts `resourceType: 'video'`;
- `ProviderAssetSchema` accepts images and videos;
- `CloudinaryProvider.buildVideoUrl()` exists;
- provider listing and deletion understand videos.

The active upload and Photos flow is still image-only:

- `UploadIntentSchema` accepts only image MIME types and `resourceType: 'image'`;
- `UploadSessionSchema.expectedResourceType` is image-only;
- upload authorization always targets Cloudinary's `/image/upload` endpoint;
- allowed upload formats are image formats only;
- `uploadMedia()` hard-codes `resourceType: 'image'`;
- the Photos file input accepts image MIME types only;
- `MediaRepository.listPhotos()` explicitly filters `resourceType: 'image'`;
- public presentation types have no `kind` discriminator, poster URL, or playback URL.

Do not work around these constraints in the React component. Expand the schemas, provider contract, and upload flow first.

## 3. Product contract

### 3.1 Ordering

The canonical gallery sequence is always:

1. `captureDate` descending;
2. `createdAt` descending for items with the same or missing capture date;
3. `_id` descending as the final stable tie-breaker.

The item array, API pages, lightbox Previous/Next behavior, screen-reader position labels, and admin listing must all use this sequence.

Changing an item's capture date may move it to a different position after the next refresh. A section break moves with the item to which it is attached.

### 3.2 Section breaks

`photoSectionBreak` belongs to the first item in a section. It is valid for the break to have:

- a title and text;
- only a title;
- only text;
- neither, producing visual separation without a visible heading.

Pagination must not create an artificial section boundary. When an appended page begins with an item that has no `photoSectionBreak`, it remains part of the previous page's final section. Re-running `groupPhotos()` over the accumulated canonical item array already provides this behavior.

Each section owns an independent masonry grid. A real section break finishes the previous masonry block and starts a fresh four-column block beneath the optional heading/note.

### 3.3 Responsive masonry

Target column counts:

- desktop wider than 1100px: 4 columns;
- tablet from 701px through 1100px: 3 columns;
- mobile 700px or narrower: 2 columns.

All media tiles retain their source aspect ratio. There is no fixed tile height, `object-fit: cover`, or gallery crop.

Use a deterministic masonry calculation rather than CSS multi-column layout. CSS columns can rebalance and visibly move old tiles when new pages append. Existing tiles should stay in their assigned positions when more records arrive at the same viewport width.

Recommended implementation:

- keep the canonical chronological item list flat in the DOM;
- use each item's stored `width` and `height` to estimate rendered height;
- assign each item to the currently shortest column;
- use a CSS grid with a small fixed row unit, such as 8px;
- calculate explicit `gridColumn`, `gridRowStart`, and `gridRowEnd` values;
- use `ResizeObserver` to recalculate when the gallery width or column count changes;
- reset column heights at each real section break;
- place appended items deterministically by recalculating from the start. Existing assignments remain the same because all earlier inputs remain unchanged.

Keep the masonry calculator as a pure exported function so it can be tested without rendering a browser.

Suggested signature:

```ts
type MasonryInput = {
  id: string;
  width: number;
  height: number;
};

type MasonryPosition = {
  id: string;
  column: number;
  rowStart: number;
  rowSpan: number;
};

function calculateMasonryLayout(
  items: MasonryInput[],
  options: {
    columns: number;
    containerWidth: number;
    gap: number;
    rowUnit: number;
  },
): MasonryPosition[];
```

Do not reorder the canonical array itself. The lightbox must navigate by the original chronological array, not column order.

### 3.4 Infinite loading

Use cursor pagination, never numeric offsets. New uploads or capture-date edits can change the front of the collection, making offset pagination duplicate or skip records.

Defaults:

- initial server-rendered page: 24 items;
- subsequent API page size: 24 items;
- maximum accepted API page size: 48 items;
- begin loading when the sentinel is approximately 800px below the viewport (`rootMargin: '800px 0px'`);
- allow only one page request at a time;
- deduplicate appended results by application media ID;
- stop observing when `nextCursor` is null.

Render an actual `Load more` button while another page exists. The `IntersectionObserver` may activate that same loading function automatically, but the button is required for keyboard users, browsers without observer support, and retrying after an error.

Automatic loading failure behavior:

- retain all media already displayed;
- show a short inline error near the button;
- change the button label to `Try again`;
- never replace the entire gallery with an error screen because a later page failed.

If the active lightbox reaches one of the final four loaded items and another cursor exists, prefetch the next page. Do not advance past the final loaded item until that request succeeds.

### 3.5 Video grid behavior

A video looks like a normal masonry tile based on its natural width and height, but the grid renders only a poster image.

The grid must not contain a `<video>` element and must not request the MP4/WebM file. It renders:

- a Cloudinary-generated still frame, preferably from the first useful frame rather than a separate uploaded asset;
- a restrained play marker with accessible text;
- the same caption/date treatment as an image, when applicable.

The poster transformation belongs in `CloudinaryProvider`, not in a React component. Add a validated `buildVideoPosterUrl()` method and unit tests for correct encoding, versioning, width limiting, and image output format.

### 3.6 Video lightbox behavior

Only the active lightbox item may mount a `<video>` element.

Use:

```tsx
<video
  controls
  playsInline
  preload="none"
  poster={item.posterUrl}
  src={item.playbackUrl}
/>
```

Rules:

- do not autoplay;
- do not preload adjacent videos;
- do not render hidden video elements for non-active items;
- closing the lightbox or navigating away must unmount the previous video;
- preserve `preload="none"` even when the item is active, so playback bytes begin on user intent;
- keep Arrow Left/Right, Escape, swipe, position status, caption, and date behavior consistent with images;
- pause is implicit when the element unmounts, but add an explicit cleanup only if testing reveals playback continues;
- honor reduced-motion settings for UI transitions.

The public JSON may contain a playback URL string because a URL in JSON does not download the video. The browser must not assign that URL to a `<video>` element until the item is active.

## 4. Public pagination contract

### 4.1 Repository result

Replace or extend `MediaRepository.listPhotos()` with a paged query. Retaining the name is acceptable, although `listGalleryMedia()` better reflects mixed media.

```ts
type GalleryCursor = {
  version: 1;
  captureDate: string | null;
  createdAt: string;
  id: string;
};

type GalleryMediaPage = {
  items: MediaAsset[];
  nextCursor?: string;
};
```

The cursor is an opaque base64url-encoded JSON value. Decode it on the server and validate it with Zod. Reject malformed, oversized, unsupported-version, or invalid-date cursors with a 400 response. Do not trust cursor fields merely because they were generated by this application.

Query one extra record (`limit + 1`) to determine whether another page exists. Return only `limit` items and create the next cursor from the final returned item.

### 4.2 Cursor filter

Continue sorting by:

```ts
{ captureDate: -1, createdAt: -1, _id: -1 }
```

When the last item has a capture date, the next-page filter must include:

- records with an earlier capture date;
- records with the same capture date but an earlier `createdAt`;
- records with the same capture date and `createdAt` but a lower `_id`;
- records without `captureDate`, because they sort after dated records.

When the last item has no capture date, limit the continuation query to records without `captureDate`, then compare `createdAt` and `_id`.

Always include the base filter:

```ts
{
  status: 'ready',
  showInPhotos: true,
  resourceType: { $in: ['image', 'video'] },
}
```

Add `_id: -1` to the existing `photos_chronological` index:

```ts
{ showInPhotos: 1, status: 1, captureDate: -1, createdAt: -1, _id: -1 }
```

The exact index order should match the final query explain plan. Test the behavior; do not assume the old index is sufficient.

### 4.3 Public route handler

Add `app/api/photos/route.ts`.

Request:

```text
GET /api/photos?limit=24&cursor=<opaque cursor>
```

Response:

```ts
type PublicGalleryPage = {
  items: PublicGalleryItem[];
  nextCursor: string | null;
};

type PublicGalleryItem =
  | {
      id: string;
      kind: 'image';
      width: number;
      height: number;
      alt: string;
      caption?: string;
      captureDate?: string;
      sectionBreak?: { title?: string; text?: string };
      thumbnailUrl: string;
      displayUrl: string;
    }
  | {
      id: string;
      kind: 'video';
      width: number;
      height: number;
      alt: string;
      caption?: string;
      captureDate?: string;
      sectionBreak?: { title?: string; text?: string };
      posterUrl: string;
      playbackUrl: string;
    };
```

Use a shared server-only mapper for both the initial page and `/api/photos`; otherwise URL, alt-text, and field behavior will drift.

Suggested file:

```text
lib/photos/presentation.ts
```

The mapper should:

- receive `MediaAsset` records and the configured provider;
- generate a width-limited grid image URL (approximately 768px);
- generate a larger lightbox image URL (approximately 1920px);
- generate a width-limited poster URL for videos;
- generate an optimized playback URL for videos;
- fall back from `altText` to `caption`, then `originalFilename`;
- expose no provider IDs, upload-session values, private EXIF, or private location data.

The route is public and read-only. It must not use the admin authorization helper.

Return structured errors without leaking database or Cloudinary configuration. A later-page failure should be recoverable by the client.

### 4.4 Initial server render

Update `app/photos/page.tsx` to request the first repository page with a limit of 24 and render:

```tsx
<PhotosGallery
  initialItems={page.items}
  initialCursor={page.nextCursor ?? null}
/>
```

Do not have the client refetch page one after hydration. The first page remains server rendered for useful HTML, fast first paint, and metadata-free progressive enhancement.

## 5. Client gallery state and loading

Update `components/photos/PhotosGallery.tsx` to own accumulated pagination state:

```ts
const [items, setItems] = useState(initialItems);
const [nextCursor, setNextCursor] = useState(initialCursor);
const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
```

Implementation requirements:

- keep an `AbortController` for the current request and abort it on unmount;
- use a ref or state guard to prevent overlapping requests;
- URL-encode the cursor with `URLSearchParams`;
- check `response.ok` before parsing as success;
- deduplicate by `id` when appending;
- update `nextCursor` only after a successful response;
- announce newly loaded count through a quiet `aria-live="polite"` region;
- keep the observer sentinel after the masonry sections;
- disconnect/reconnect the observer when the cursor or loading state changes;
- retain a manual button whenever `nextCursor` is non-null;
- do not display an infinite spinner after the cursor becomes null.

Lightbox state should continue to store the active canonical array index. Appending items must not change the currently active item.

## 6. Video upload implementation

### 6.1 Accepted formats

Initial supported video inputs:

- `video/mp4` (`.mp4`);
- `video/quicktime` (`.mov`);
- `video/webm` (`.webm`).

Keep image formats unchanged.

Use separate size limits for images and videos. Keep the current image limit, and introduce an environment-configurable video limit, for example `CLOUDINARY_EDITOR_MAX_VIDEO_BYTES`. Choose and document a safe default before merging; 250 MB is a reasonable starting point for an owner-only portfolio editor, but the final value must match the Cloudinary account and deployment request limits.

Do not silently treat a video MIME type as an image resource. Validate that MIME type and requested resource type agree.

### 6.2 Provider and schema changes

Update these areas:

- `lib/media/providers/MediaProvider.ts`
  - add accepted video MIME types;
  - make `UploadIntentSchema.resourceType` an image/video enum;
  - add a refinement matching MIME category to resource type;
  - extend authorization types if allowed formats differ by resource type;
  - add a validated `VideoPosterInputSchema` and provider method.
- `lib/media/schemas.ts`
  - change `UploadSessionSchema.expectedResourceType` to image/video;
  - ensure finalization cannot finalize an image session with a video or vice versa.
- `lib/media/providers/CloudinaryProvider.ts`
  - select `/image/upload` or `/video/upload` from the validated intent;
  - use resource-specific allowed formats;
  - use resource-specific maximum byte limits and error copy;
  - add `buildVideoPosterUrl()`;
  - retain signed upload, inspection, and deletion behavior.
- `lib/media/repository.ts`
  - persist the requested resource type in the upload session;
  - verify inspected provider type against the session during finalization.
- `app/api/admin/media/finalize/route.ts`
  - return a clear 400 error for resource-type mismatch.

Do not construct Cloudinary delivery URLs directly in UI files.

### 6.3 Client upload helper

Refactor `lib/client/upload-media.ts` so the helper derives the resource type from the selected file MIME type and sends it in the authorization request.

Renaming `uploadMedia()` is optional; retaining the name avoids churn. Its returned type must include `resourceType` so the editor can render correct status and labels.

Ensure normalization still handles Cloudinary's variant fields for both resource types. Add client tests with representative image and video upload responses.

### 6.4 Photos editor

Update `PhotosWorkspace.tsx` and the server page mapper:

- accept all supported image and video MIME types;
- change copy from `photographs` where necessary to `photos and videos` or `media`;
- continue sequential uploads initially. Parallel large videos can saturate the browser and should not be introduced in this work;
- show progress as `Uploading 2 of 6` and include the current filename;
- preserve partial success and list failures at the end;
- show a generated poster for video editor cards;
- add a visible `Video` badge;
- keep capture date, caption, alt text, section break, and remove-from-Photos behavior identical;
- use `video`/`videos` in success and error text when appropriate rather than claiming every file is a photo.

The file's `lastModified` value remains only a starting point. The author can correct `captureDate` after upload.

## 7. Component decomposition

Avoid turning `PhotosGallery.tsx` into one very large component. A reasonable split is:

```text
components/photos/PhotosGallery.tsx
components/photos/MasonryGrid.tsx
components/photos/GalleryTile.tsx
components/photos/GalleryLightbox.tsx
components/photos/masonry.ts
components/photos/photos-gallery.module.css
lib/photos/cursor.ts
lib/photos/presentation.ts
app/api/photos/route.ts
```

Responsibilities:

- `PhotosGallery`: accumulated pages, section grouping, observer/button, active index;
- `MasonryGrid`: resize measurement and explicit masonry positions for one section;
- `GalleryTile`: image or video-poster tile and play marker;
- `GalleryLightbox`: modal interaction and active image/video rendering;
- `masonry.ts`: pure deterministic layout math;
- `cursor.ts`: server-only cursor encode/decode and validation;
- `presentation.ts`: server-only provider-backed public DTO mapping.

Keep server-only modules marked with `import 'server-only'` so provider credentials and database code cannot enter the client bundle.

## 8. Performance requirements

The implementation is not complete unless network behavior proves the intended laziness.

On initial `/photos` load:

- no more than 24 gallery DTOs are in the HTML/RSC payload;
- no video playback request is made;
- only visible and near-visible grid posters/images load;
- below-fold media remains lazy;
- no original-resolution Cloudinary assets are requested;
- there is no client refetch of the first 24 records.

On scroll:

- one metadata page is requested at a time;
- appending a page does not move previously placed masonry tiles at the same width;
- duplicate IDs are ignored;
- section breaks remain correct across the page boundary.

On opening a video:

- only that video element is mounted;
- it uses a poster and `preload="none"`;
- no adjacent video is requested;
- closing or navigating removes the video element;
- a reader who never presses play should transfer only the poster, not the video body.

Keep `next/image` for image and poster rendering. Supply accurate `width`, `height`, and `sizes` values to prevent layout shift.

## 9. Accessibility and interaction requirements

- Every tile is a native button with an accessible label distinguishing `photo` and `video`.
- Video state is not communicated by icon alone; include visually hidden or accessible text.
- The manual `Load more`/`Try again` button is always available while another page exists.
- New-item announcements use `aria-live="polite"`; loading progress must not repeatedly interrupt screen readers.
- Lightbox focus moves to Close on open and returns to the opening tile on close.
- Escape closes; Arrow Left/Right navigates; touch swipe behavior remains.
- The lightbox traps focus or otherwise prevents focus from moving into obscured page content.
- The document body scroll lock is restored on every close/unmount path.
- Caption and date remain available for images and videos.
- Reduced-motion users receive no masonry or lightbox movement animation.
- Canonical lightbox ordering remains chronological even though masonry positions are spatial.

## 10. Testing plan

### 10.1 Unit tests

Add repository/cursor tests covering:

- first page and next page;
- more than one record with the same capture date;
- more than one record with the same capture date and creation time;
- records without a capture date after dated records;
- no duplicates or gaps across pages;
- hidden, pending, archived, and failed records excluded;
- images and videos both included;
- malformed and unsupported cursor rejection;
- `limit + 1` next-cursor behavior.

Add masonry tests covering:

- original aspect ratios used in height calculations;
- shortest-column assignment;
- deterministic output;
- appending items leaves existing positions unchanged;
- recalculation for 4, 3, and 2 columns;
- empty and single-item sections;
- separate section grids reset column heights.

Add provider/upload tests covering:

- image authorization remains unchanged;
- MP4, MOV, and WebM authorization uses the video endpoint;
- image/video MIME and resource mismatch rejection;
- image and video size limits;
- response verification and finalization for video;
- upload-session resource mismatch rejection;
- video poster URL encoding and transformation;
- optimized video delivery URL.

### 10.2 Component tests

Mock `IntersectionObserver` and `fetch` to prove:

- first page is not fetched again;
- sentinel intersection requests one next page;
- repeated intersections while loading do not create duplicate requests;
- successful records append in order and deduplicate;
- API error keeps existing tiles and exposes `Try again`;
- null cursor removes the loader/button;
- section grouping is correct across appended pages.

Video rendering tests must prove:

- a grid video renders a poster and play label, not a `<video>`;
- opening an image does not mount a video;
- opening a video mounts exactly one `<video preload="none">`;
- navigating away and closing unmount it;
- Previous/Next uses canonical chronological order.

### 10.3 End-to-end verification

Extend the authoring flow or add a focused Photos gallery spec that:

1. uploads enough deterministic fixtures to require a second page, or seeds them through the E2E database;
2. confirms the initial page count;
3. scrolls or clicks Load more and sees the next page;
4. confirms the first page has no duplicate IDs after append;
5. verifies a section heading whose first item falls on page two;
6. opens a photo and navigates across the page boundary;
7. includes one E2E video record and confirms poster-only grid behavior;
8. opens the video and confirms controls and `preload="none"`.

Use browser network inspection during manual verification. Confirm that no `.mp4`, `.webm`, Cloudinary video-delivery, or equivalent playback request happens before user playback intent.

## 11. Suggested stacked delivery order

Follow `AGENTS.md`: keep each PR focused on one aspect and ensure tests and linters are green before opening it.

### Stack 1 — Stable gallery cursor and public page API

- Add cursor encoding/validation.
- Add paged repository query and supporting index.
- Add shared presentation mapper.
- Add `GET /api/photos`.
- Server-render only the first 24 items.
- Add repository, cursor, route, and mapper tests.

Exit condition: two API pages can be fetched without duplicates or omissions, including tied and missing dates.

### Stack 2 — Infinite loading

- Move gallery items into accumulated client state.
- Add observer sentinel, manual button, retry state, deduplication, abort cleanup, and aria-live status.
- Add near-end lightbox prefetch.
- Add component tests.

Exit condition: later pages append reliably without refetching the first page or replacing already rendered content.

### Stack 3 — Stable masonry presentation

- Add pure masonry calculation.
- Add measured 4/3/2-column section grids.
- Preserve flat chronological DOM/lightbox order.
- Add layout tests and visual checks at desktop, tablet, and mobile widths.

Exit condition: original aspect ratios form a dense brick layout, and appending a page does not reposition existing items at the same width.

### Stack 4 — Video upload and provider support

- Expand upload intent/session schemas.
- Add resource-specific Cloudinary authorization and size limits.
- Add poster URL generation.
- Update client upload normalization and E2E provider.
- Update the admin Photos uploader/cards.
- Add provider, repository, client, and admin tests.

Exit condition: the author can upload and edit a video as a ready Photos-tab media record with a generated poster.

### Stack 5 — Public video tiles and on-demand playback

- Add discriminated public DTOs.
- Render poster-only video tiles and a play marker.
- Mount only the active video in the lightbox with `preload="none"`.
- Add component, browser, and network-behavior tests.

Exit condition: video appears in chronological masonry and transfers no playback bytes until user intent.

## 12. Files expected to change

Likely modifications:

```text
app/photos/page.tsx
app/admin/(protected)/photos/page.tsx
app/admin/(protected)/photos/PhotosWorkspace.tsx
app/api/admin/media/finalize/route.ts
app/api/admin/media/upload-authorizations/route.ts
components/photos/PhotosGallery.tsx
components/photos/photos-gallery.module.css
lib/client/upload-media.ts
lib/db/indexes.ts
lib/media/provider.ts
lib/media/repository.ts
lib/media/schemas.ts
lib/media/providers/CloudinaryProvider.ts
lib/media/providers/E2EMediaProvider.ts
lib/media/providers/MediaProvider.ts
tests/media/cloudinary-provider.test.ts
tests/media/repository.test.ts
tests/media/schemas.test.ts
tests/media/upload-media.test.ts
```

Likely new files:

```text
app/api/photos/route.ts
components/photos/GalleryLightbox.tsx
components/photos/GalleryTile.tsx
components/photos/MasonryGrid.tsx
components/photos/masonry.ts
lib/photos/cursor.ts
lib/photos/presentation.ts
tests/photos/cursor.test.ts
tests/photos/gallery.test.tsx
tests/photos/masonry.test.ts
```

The exact split may vary, but do not mix database/provider logic into client components.

## 13. Explicit non-goals

Do not include these in the initial implementation:

- autoplaying videos;
- background video playback;
- preloading adjacent videos;
- custom poster-frame selection UI;
- trimming, transcoding-progress UI, or video editing;
- audio-only assets;
- reactions, comments, or view analytics;
- drag-and-drop public ordering that overrides chronology;
- replacing Cloudinary or bypassing the provider abstraction;
- infinite loading in the admin editor. Admin pagination can be planned separately if its collection becomes large.

## 14. Completion checklist

The overall feature is complete only when all statements below are true:

- [ ] `/photos` server-renders no more than 24 initial items.
- [ ] Further pages use a validated stable cursor, not offsets.
- [ ] Four-column desktop masonry preserves original aspect ratios.
- [ ] Tablet uses three columns and mobile uses two.
- [ ] Existing masonry tiles do not jump when a page appends at the same width.
- [ ] Optional breaks, headings, and notes remain correct across page boundaries.
- [ ] Images and videos share one chronological sequence.
- [ ] The admin uploader accepts the agreed image and video formats.
- [ ] Upload sessions verify that the finalized resource type matches the authorized type.
- [ ] Grid videos render only poster images.
- [ ] No video element exists until a video is opened.
- [ ] Active videos use `preload="none"`, `playsInline`, and controls without autoplay.
- [ ] Closing or navigating unmounts the prior video.
- [ ] A manual Load more/Try again control accompanies automatic loading.
- [ ] Later-page errors do not erase already loaded media.
- [ ] Keyboard, touch, focus, and reduced-motion behavior are verified.
- [ ] Unit, component, E2E, typecheck, lint, and production build checks pass.
- [ ] Browser network inspection proves that initial page load transfers no video playback body.
