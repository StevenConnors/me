# Glass introduction and progress log failure cases

Before changing the Glass page:

- The page shows a visible "Glass" heading and a one-line introduction; the heading is the page's only `h1`.
- Photographs are grouped into consecutive months, labelled from the capture date and otherwise the upload date ("October 2024"), keeping the collection's order.
- Each month heading shows how many photographs it holds.
- The lightbox still opens the right photograph and steps through every photograph across months ("Glass, 3 of 3").
- Assets without a capture date still appear, grouped by upload month; a collection with no dates at all still renders.
- At 390 px the page has no horizontal scrolling and the grid stays two columns.
- Performance: no new client JavaScript beyond the existing gallery and no extra requests; LCP on `/glass` does not regress.
