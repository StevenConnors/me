# Photos wayfinding failure cases

Before changing the Photos section navigation and section headers:

- Each link in the "Photo sections" navigation shows the section title and how many photographs it holds, counted from the published document, including photos not loaded yet.
- Each section header shows the same count ("25 photos", "1 photo").
- On desktop the section navigation stays at the top of the viewport while the visitor scrolls through the photographs, without covering a section heading after a jump.
- Jumping to a section that is not loaded yet still loads it and lands on its heading.
- The legacy gallery (no published Photos document) still renders with counts for its sections.
- At 390 px the navigation scrolls sideways inside itself and the page has no horizontal scrolling.
- Performance: counts come from the server payload; no extra requests and no layout shift from the sticky bar.
