# Home introduction and journey index failure cases

Before changing the Home page introduction and the journey list:

- A first-time visitor sees one line about what the site is above the Photos heading. It must not push the first row of photographs below the fold at 1280×800.
- Each published journey row shows its cover photograph, title, summary and a meta line with places and dates taken from the published revision (for example "Japan / October 2024 — November 2024").
- The cover is a thumbnail with the cover's alt text. A decorative cover keeps empty alt text. A cover whose media is missing or cannot be built leaves the row readable with no broken image.
- A journey without `experiencedAt` or locations shows no empty meta line.
- Legacy rows remain visible alongside published journeys, without covers or meta. Published rows keep publication-date descending order; legacy rows follow in the order poc, dfw-okc, newpoc.
- A published journey with a legacy slug appears once, with its database title and summary.
- A legacy slug that redirects to a renamed published journey does not add a second archive row. If public slug lookup fails, the legacy rows remain available.
- The Journeys heading count matches the combined rows, including when no journeys are published or the database is unavailable.
- All legacy links use /stories/<slug> and remain readable at 390 px without horizontal overflow or runtime errors.
- At 390 px every row shows the cover and title without horizontal scrolling, and the summary may be hidden as before.
- Performance: covers use `next/image` with `sizes` near their rendered width and lazy loading, so the Home LCP element stays a photograph from the Photos grid and transfer size grows by only the thumbnails.
