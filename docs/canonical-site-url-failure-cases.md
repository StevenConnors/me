# Canonical site URL failure cases

- A published journal canonical points to localhost when Vercel supplies the production hostname but no explicit site URL.
- An explicit site URL loses precedence over the Vercel hostname.
- Local development without either setting loses its localhost fallback.
- An invalid configured URL silently produces broken metadata instead of failing.
- Production smoke misses a missing canonical, wrong origin, or missing journal link.
- The canonical changes between desktop and a 390 px viewport, or the journal logs runtime errors.

No layout, assets, or client code change. Performance risk is limited to server metadata resolution.
