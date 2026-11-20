# Legacy browser fallback
- Without container queries, photos remain in source order in a two-column grid, retain their aspect ratios, and do not overlap.
# Photos masonry failures

- At 390 px or 412 px, the first server-rendered photo layout has different tile positions or section height after hydration.
- Resizing the gallery leaves the wrong number of columns or horizontal overflow.
- Responsive layout changes reorder the photo image sources or keyboard order.
- Portrait and landscape photos overlap, disappear, or lose their aspect ratios.
- The admin desktop or mobile canvas fails to render the shared gallery.
- Empty sections or failed photo pagination cause runtime errors.
- Loading photos causes cumulative layout shift above 0.1.
