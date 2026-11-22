# Trip expenses failure cases

Shared trip costs are entered by the author in `/admin/trips` and shown read-only at `/<trip-slug>` (for example `/india-2026`). Everything settles in Japanese yen.

## Money and conversion
- An amount with more decimals than its currency allows (`₹10.005`, `¥10.5`) is stored silently rounded instead of rejected.
- Floating-point maths makes `₹0.1 + ₹0.2` style totals drift; amounts must be stored as integer minor units.
- The yen value of a foreign expense uses today's rate instead of the rate for the date it was spent.
- A weekend or holiday date gets no rate; it must fall back to the previous published reference rate and show which date that rate is from.
- The rate provider is down or has no rate (future date); the expense is saved with a made-up rate instead of failing with a clear message that lets the author enter a manual rate.
- A manual rate of 0, a negative rate or a non-number is accepted.
- A yen expense is "converted" with a fetched rate instead of exactly 1.
- Editing an old expense changes its rate without the author asking (a stored rate must stay fixed unless the expense is saved again).

## Splitting and settling
- An equal split that does not divide evenly loses or invents a yen (`¥1,502 / 3`); shares must add up exactly to the expense.
- Balances across all people do not sum to zero.
- Settle-up suggests more payments than needed, pays someone who is owed, or suggests a ¥0 payment.
- An expense names a payer or split person who is not on the trip.
- An expense split among nobody, or among the same person twice.
- Removing a person who already appears in expenses orphans those expenses (people can be renamed or added, not removed).

## Data and concurrency
- Two edits of the same expense from two tabs: the later one silently overwrites the first instead of returning a conflict.
- Creating a second trip with an existing slug overwrites the first.
- A trip slug equal to an existing top-level route (`photos`, `admin`, `api`) can be created but never shown.
- Invalid JSON or unknown fields in an API body are accepted or crash with a 500.
- A rejected write (bad currency, unknown payer, unavailable rate) partially persists.

## Auth and public exposure
- Admin trip and expense APIs respond to visitors without the author session.
- The public trip page exposes edit or delete controls, or is linked from site navigation.
- The public page is indexed by search engines (it must send `noindex`).
- An unknown slug like `/not-a-trip` renders an empty trip instead of a 404.
- Descriptions and names render as HTML instead of text.

## Layout and runtime
- At 390 px the expense list, balances or settle-up table force horizontal scrolling.
- Long descriptions or names overflow their cells.
- Runtime or console errors on the admin editor or public page.
- Perf: the public trip page ships client JavaScript for what is a static read-only summary, or adds JS to other public routes.
