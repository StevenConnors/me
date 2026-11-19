# Paper shell failure cases

Before changing how public "held places" pages (Home, Photos, Travel, Glass, journeys) meet the browser edge:

- The paper background must reach all four edges of the viewport at 1280 px and at 390 px. No white strip from the old `body` padding may show on any side.
- The body behind the page must be paper-coloured, so overscroll and short pages do not flash white.
- No public page may scroll horizontally at 390 px.
- Legacy MDX stories and admin pages still depend on the old `body` padding. They must keep it until they move to the new shell.
- The admin journey preview renders the paper shell inside the admin layout. It must not lose the admin page padding.
- Performance: CSS only. No new client JavaScript and no layout shift.
