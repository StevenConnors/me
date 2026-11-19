# Journey wayfinding failure cases

Before adding chapter contents, reading progress and previous/next links to held-places journey pages:

- A journey with two or more chapters lists every chapter under a "Chapters" navigation after the hero. A chapter with a heading uses the heading. A chapter without one uses the start of its text, cut at a word boundary. A chapter with neither uses "Chapter N".
- Each contents link jumps to its chapter (`#chapter-N`), and the chapter title is not hidden under the top of the viewport.
- A journey with one chapter shows no contents list.
- A reading progress bar at the top of the viewport grows from empty at the top of the page to full at the bottom. It is decorative and is not announced to screen readers. It needs no client JavaScript; browsers without CSS scroll timelines show no bar.
- The end of a journey links to the next newer and next older published journey by publish date. The newest journey has no newer link, the oldest has no older link, and a journey that is the only one published shows neither.
- If the published list cannot be loaded the journey still renders without the links.
- At 390 px the contents list and the previous/next links fit without horizontal scrolling.
- Performance: no new client JavaScript; one extra indexed query for neighbours.
