# Travel public page failure cases

Before implementation, the public geography view needs to account for these cases:

- The travel repository may throw or return no record; the route must render an explicit unavailable state and must not present invented places.
- A saved code may no longer exist in the bundled catalog; counts, map highlighting, and the list must ignore unknown codes instead of crashing.
- A saved code may appear more than once; the public count and displayed place list must treat selections as a set.
- A catalog entry may be absent from its SVG map dataset; the map must expose that absence through its asset/data contract and never silently highlight a different shape.
- Country, state, and prefecture codes use different forms; region-specific paths must prevent a code from one region highlighting another.
- Many countries are small at world scale; the map must provide equivalent readable names and selected status in a text list and usable map focus targets where practical.
- User-controlled names must be rendered as text, not injected markup.
- Long region labels, localized place names, and large selection sets must wrap without forcing horizontal scrolling on narrow screens.
- Keyboard users must be able to switch regions, focus individual shapes, inspect selected state, and toggle a shape only when the map is editable.
- A decorative map should not duplicate the place list to screen readers; an interactive map must have an accessible name and button semantics per place.
- Initial/loading, empty, repository-unavailable, and non-empty states must be distinguishable and not imply that the visitor has traveled to every destination.
