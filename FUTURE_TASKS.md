# Future Tasks and Product Direction

Last updated: 2026-09-20

This document contains work that is intentionally outside the active Held Places template project in `PLAN.md`. It is a backlog, not an implementation specification. Completed editor-foundation work is recorded in Git history rather than repeated here.

## North star

Build a personal, durable archive of journeys: a place for photographs, travel writing, short observations, and the context connecting them.

A journey may be a full essay, a primarily visual sequence, or something in between. Publishing should remain direct, the public experience should feel deliberately edited, original media should remain recoverable, and no third-party platform should become the only copy of the archive.

## Product principles

- A journey is the primary unit of content.
- The author chooses content; versioned templates own presentation.
- Drafts and immutable published revisions remain separate.
- Original media is archival; crops and focal points are reversible presentation data.
- Public pages must remain fast and economical on mobile connections.
- Application IDs and open exports protect the archive from provider lock-in.
- Ongoing cost and operational complexity should remain low.


## 3. Media library depth

- Add visible media search, pagination, and filters to the admin library.
- Show every draft and published usage before deletion or replacement.
- Add checksum-based duplicate warnings and a reviewable merge workflow.
- Add orphaned-upload reconciliation without automatic destructive cleanup.
- Add bulk metadata editing where it meaningfully reduces repetitive work.
- Expand metadata editing for capture date and privacy-safe public location.
- Add a dedicated crop tool for manual rectangles and zoom if focal points prove insufficient.
- Preview media in cover, chapter, carousel, social, and future card contexts.

## 4. Video authoring

- Add signed video upload and reusable video media records.
- Define poster-frame, preload, controls, caption, and transcoding policies.
- Keep mobile loading conservative and avoid simultaneous autoplay.
- Add a template-owned video chapter treatment before exposing video in the editor.
- Measure bandwidth and transformation cost using representative journey pages.

## 5. Geographic storytelling

- Define route and checkpoint data independently of any map provider.
- Let a chapter optionally reference a geographic checkpoint.
- Prototype a clear map treatment that does not compete with prose or media.
- Design separate desktop and mobile interactions with reduced-motion and non-animated fallbacks.
- Support approximate, unknown, and intentionally private locations.
- Strip or reduce precise GPS data before publication.
- Compare map renderers and tile providers against the cost and privacy constraints when this work becomes active.

## 7. Additional templates and public experiences

- Evaluate another template only after Held Places has been used for multiple real journeys.
- Keep each future template versioned, responsive, and free of author-entered CSS.
- Define whether a future photo-first template needs different chapter slots rather than optional layout controls.
- Add previous and next journey navigation when the archive is large enough to benefit.
- Reconsider standalone photograph pages versus photographs primarily living inside journeys.
- Consider a curated photographs index using original aspect ratios or an editorial masonry treatment.
- Consider a custom domain once the public structure and migration are settled.

## 8. Performance, resilience, and operations

- Measure real mobile image, carousel, and video loading before and after major media changes.
- Add automated checks for broken media references and unpublished-draft leakage.
- Add structured publication, migration, restore, deletion, and reconciliation audit events.
- Track failed uploads, orphan counts, Cloudinary storage, bandwidth, and transformation use.
- Re-evaluate Cloudinary only from measured usage, cost, exportability, and reliability data.
- Compare object-storage or repository-backed alternatives only if those measurements justify migration.
- Keep generated derivatives separate from original-media backups.

## 9. Site and editorial follow-ups

- Fix or intentionally retire the broken `thoughts aloud` experience and standardize its name.
- Decide whether short thoughts are their own content type or a lightweight journey format.
- Add intentional experienced, written, and published date presentation where useful.
- Add quiet authorship credits and a lightweight copy-editing pass that preserves the personal voice.
- Revisit progress or chapter indicators only after the Held Places reading flow is established.
- Consider `Photographs` as the public navigation label instead of `Photo Gallery`.

## Promotion rule

Move a backlog item into `PLAN.md` only when it has a clear user outcome, acceptance criteria, dependencies, and a focused PR stack. Do not mix unrelated backlog items into Held Places implementation PRs.
