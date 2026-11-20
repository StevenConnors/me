# Photos section hash links

- Opening a section beyond two loaded pages leaves the visitor at the top.
- Changing the hash without clicking a section link fails to load its photos.
- Empty, unrelated or unknown hashes cause unnecessary loading or never settle.
- A pagination error retries endlessly instead of offering the existing retry control.
- A deep section heading is hidden behind navigation, including at 390 px.
- Section navigation introduces browser errors or horizontal overflow.

The regression spec checks direct entry, hash changes, unknown hashes, retry,
heading visibility and mobile width. Existing photos wayfinding checks clicks.
No image sizing or delivery changes are made; production performance is measured
separately from dev-server scroll evidence.
