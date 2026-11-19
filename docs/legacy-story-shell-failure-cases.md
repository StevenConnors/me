# Legacy story shell failure cases

Before moving the MDX stories (`/stories/poc`, `/stories/newpoc`, `/stories/dfw-okc`) into the paper shell:

- The page uses the same header (Primary navigation with Photos, Travel, Glass, Work) and footer (Footer navigation) as the rest of the site; the old "thoughts aloud / photos" header is gone.
- The story title is the only `h1`; the site name is no longer a second `h1`.
- The paper background reaches the viewport edges at 1280 px and 390 px, with no white frame and no body padding.
- On desktop the fixed media panel starts below the header and never covers the navigation.
- On desktop the text column, step indicators and media panel do not overlap each other.
- At 390 px the story stacks text and media with no horizontal scrolling.
- The admin journey preview keeps its existing padding.
- Steps still change the media panel while scrolling; the page has no runtime errors.
- Performance: no new client JavaScript beyond removing the old header; LCP on `/stories/poc` does not regress.
