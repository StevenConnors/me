# UX performance failure cases

- A listener on the benchmark port answers requests even though the new Next.js process failed to bind. The benchmark must refuse to report numbers from that listener.
- A route returns HTTP 200 but shows no seeded content, or its fixture photo fails to load. Neither a baseline nor a comparison may be reported.
- A route returns a non-200 response or throws a browser error during a load. The benchmark must reject that sample instead of reporting it.
