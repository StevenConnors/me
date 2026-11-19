# Journey autosave failures

- A delayed successful save replaces body or metadata typed after that request began.
- A pending autosave uses the old editVersion, or overlaps the previous request, causing a false conflict instead of persisting newer edits.
- A save with no intervening edits fails to show Saved or persist empty optional fields.
- A genuine competing edit is silently overwritten instead of showing the conflict notice and retaining local text.
- The delayed-save flow emits browser runtime or console errors.

These are private authoring changes with no public layout or download changes; public mobile layout and performance are unaffected.
