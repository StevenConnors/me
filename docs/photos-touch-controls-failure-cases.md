# Photos touch controls

- At 390 px with a coarse pointer and no hover, Edit and Select are transparent even though they accept taps.
- On a desktop with a fine pointer, Edit and Select appear before hover or keyboard focus.
- Hovering or focusing a desktop photo no longer reveals Edit and Select.
- Opening the seeded editor produces browser errors.

This CSS-only change adds no empty-state or error-state behavior. Existing Photos release tests cover empty drafts and failed saves.
