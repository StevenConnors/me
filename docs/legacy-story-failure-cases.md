# Legacy story page failure cases

Before changing how `/stories/[slug]` renders the bundled MDX stories (`dfw-okc`, `newpoc`, `poc`) when no published journey owns the slug:

- Rendering a legacy story must not log React runtime errors, such as suspending on an uncached promise created during render or updating another component (`RuntimeStyles`) while `LegacyStoryContent` renders.
- The story heading and step prose must be in the server HTML response, not only rendered after hydration.
- Each bundled slug must render its own MDX file; one slug must never show another story's content.
- A slug that is neither a published journey nor a bundled story must return 404, not an empty story shell.
- A published database journey with a legacy slug must still take precedence over the bundled MDX story.
- The scroll-driven story interactions (`Story`/`Step` client components) must still hydrate without errors.
- At 390 px the legacy story must not force horizontal scrolling.
- Missing Cloudinary configuration locally produces media 404s from `res.cloudinary.com`; that is expected and out of scope, but no other request may fail.
- Performance: legacy story pages must not ship more client JavaScript than before, and the story content must not wait for hydration to appear.
