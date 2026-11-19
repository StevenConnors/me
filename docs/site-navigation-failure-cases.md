# Site navigation failure cases

Before changing the shared header, footer and page titles on public "held places" pages:

- On Photos, Travel and Glass the header link for the current page must be marked `aria-current="page"` and look different from the other links. No other header link may be marked current.
- The Work link leaves the site for LinkedIn. It must open in a new tab with `rel="noopener noreferrer"`, show an arrow, and tell screen readers that it opens LinkedIn in a new tab.
- Home, Photos, Travel, Glass and journey pages must end with a footer whose "Footer navigation" landmark links back to Photos, Travel and Glass.
- Each public page needs its own browser tab title: "Photos | Yuji", "Travel | Yuji", "Glass | Yuji", "<journey title> | Yuji". Home keeps "Yuji - Heal the person to your right".
- At 390 px the header and footer must fit without horizontal scrolling.
- Performance: the header and footer stay Server Components. No new client JavaScript.
