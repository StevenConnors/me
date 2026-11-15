# Map label acceptance cases

- Hovering a country, state, or prefecture shows that place's name, including small country markers and places not yet visited.
- Moving between shapes updates the name; leaving the shape or pressing Escape dismisses the label.
- Keyboard focus exposes the same name on public and admin maps. Read-only interaction never changes visited selections, and admin click/keyboard toggles still work.
- Switching tabs clears stale labels. Labels stay within narrow map containers and do not intercept pointer events.
- Browser verification produces screenshots for each geography and checks for runtime errors.

Verified with the full 19-flow browser suite, 129 existing tests, typecheck, lint (existing warnings only), and a production build. The label browser flow saves country, state, and prefecture hover screenshots as repeatable artifacts. Public marker taps are also checked to preserve visited state.
