# Photos internal tags failure cases

Before changing which media tags reach the public Photos page:

- The photo viewer shows bookkeeping tags as chips: `upload-session-<key>` (added by every upload) or `legacy-story` (added by the MDX journey migration).
- `/api/photos` returns those bookkeeping tags in a photo's `tags`, so they are public even when the viewer hides them.
- Filtering drops an author's real tags (for example `night`, `Tokyo`) or changes their order.
- A tag that only starts with similar text but is a real word (for example `legacy`) is hidden.
- A photo whose only tags are bookkeeping tags still renders an empty "Photo tags" list.
- Performance: the filter adds requests or client JavaScript to `/photos`.
