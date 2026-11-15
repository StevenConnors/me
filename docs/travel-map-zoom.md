# Map interaction acceptance cases

Written before implementation:

- Pointer focus on a large country must not draw a browser outline around its rectangular bounds. Keyboard focus must still identify the actual shape and expose its name.
- Each public and admin geography supports zoom in, zoom out, and reset. Zoom stays between the full map and 12×; panning cannot lose the map beyond its edges.
- Zooming anchors to the map center with buttons and to the pointer with Ctrl/Command + wheel. Ordinary wheel scrolling still scrolls the page.
- Dragging a zoomed map pans without selecting a place or leaving a stale tooltip. A normal admin click or keyboard activation still toggles exactly once.
- Keyboard users can zoom with +/−, pan with arrow keys, and reset with Home. Focusing a place outside the zoomed view brings it into view.
- Touch users can zoom with controls or a two-finger pinch, then drag to pan. The page remains scrollable at the full-map view.
- After a pinch or drag, touch releases must activate each map control exactly once even when the browser omits the compatibility click. Mouse and keyboard activation must still work, and dragging away from a control must not activate it.
- Switching geography resets the viewport and label; resized mobile maps and controls do not overflow the page.
- Browser checks save repeatable screenshots and a JSON result and report runtime errors.

Repeat locally with the disposable E2E database and Playwright:

```sh
E2E_MONGODB_URI=mongodb://127.0.0.1:27018/travel_zoom_e2e npm run test:e2e -- e2e/travel-map-zoom.spec.ts
```

## Verified results

- Full browser suite: 22 passed, including public/admin zoom and drag, keyboard navigation, modifier-wheel zoom, ordinary page scrolling, mobile pinch/pan, region resets, and saved travel selections.
- Existing test suite: 129 passed. No unit tests were added.
- Typecheck, lint, and production build passed. Lint reports only the existing warnings in unrelated pages.
- Screenshots cover pointer focus without a bounding rectangle, all three zoomed geographies in both public and admin views, and mobile pinch zoom. `travel-map-zoom-result.json` records the before/after viewports, preserved selections, and browser errors (none).
- All browser data came from disposable local E2E databases. The checks do not change saved personal travel data.
