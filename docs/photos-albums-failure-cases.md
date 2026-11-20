# Photos albums and chapters failure cases

Before turning the Photos page into albums that open as chapters:

- Every photo has the same weight. The page has no lead image, and the author's cover and featured choices (`albumRole`) do nothing.
- A visitor cannot see what albums exist without scrolling through every earlier photo. The section links are text only.
- An album card for a section that is not loaded yet does nothing, or jumps to the wrong place.
- An album has no cover marked, and its card is blank instead of using the album's first photo.
- An album cover on a later page shows on the album card but not as its chapter hero until the visitor pages that far.
- A cover photo that is unavailable leaves a broken image on the card or chapter.
- The chapter hero shows a portrait cover at full width, so it fills several screens.
- The cover appears twice in its chapter, once as the hero and once in the grid.
- Featured photos and landscapes are the same size as the other tiles, or a wide tile is placed out of the author's order.
- The hero rotates for visitors who ask for reduced motion, or it downloads every cover at full width on first load.
- The photo viewer, shared `?photo=` links, `#section-` links, section collapse and paging stop working.
- At 390 px the album cards or chapter heroes cause horizontal scrolling.
- Performance: LCP, CLS or first-load bytes on `/photos` regress beyond the budgets in `measure-ux-performance`.
