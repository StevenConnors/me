# Thoughts Aloud failure cases

Before changing how `/thoughts-aloud` renders posts:

- A tweet whose syndication payload has empty or missing `entities` (X now returns `"entities": {}` for plain-text tweets) must not throw during render; the page must not show Next's "Application error" screen.
- A tweet that cannot be loaded (404 or network failure) must show a not-found card instead of breaking the rest of the list.
- One broken embed must not hide the other posts on the page.
- Markdown posts (quotes, bold, italic, links) must still render as formatted text.
- Bare YouTube URLs render an embed that must not be wider than the viewport; at 390 px the page must not scroll horizontally.
- No `pageerror` or console errors may be logged while the page loads.
- Performance: the fix must not add a new dependency or noticeably increase the page's client JavaScript.
