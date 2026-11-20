# Glass mobile navigation failure cases

- At 390 px, Previous or Next is hidden, smaller than 44 × 44 px, or overlaps the image.
- Clicking Next or Previous does not change the photo, including wrapping at either end.
- Horizontal swipe stops advancing photos.
- Mobile keyboard focus escapes the viewer or cannot reach the navigation controls.
- On mobile or desktop, activating Next moves focus to Close, so the next Enter closes the viewer instead of advancing again.
- The control row overflows the viewport or shifts when a photo changes.
- Desktop controls move from their existing positions.
- Opening and navigating the viewer produces browser errors.
- An empty collection renders a viewer with no photo.
- Added client code or requests slow down the gallery.
