# Travel links failure cases

Before linking visited places to journeys:

- A visited country that a published journey lists (by `countryCode`) links to that journey from the visited places list.
- A country with several journeys lists each one, newest first.
- A visited place with no journey stays plain text, with no empty link.
- Unpublished or draft journeys never appear.
- If journeys cannot be loaded, Travel still renders the map, totals and plain place names.
- Switching the region tab to US states or Japanese prefectures keeps the list working; places there stay plain until journeys record them.
- At 390 px the links wrap inside the list and the page has no horizontal scrolling.
- Performance: journey links come from the server render; no extra client requests and no LCP regression on `/travel`.
