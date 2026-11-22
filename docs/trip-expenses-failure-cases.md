# Trip expenses failure cases

The author creates trips in `/admin/trips`. Each trip gets an unguessable share link, `/trips/<id>`, where anyone holding it can add, edit and delete expenses without signing in. Everything settles in Japanese yen.

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
- Two trips get the same link, or a create call can pick its own id and overwrite another trip.
- Invalid JSON or unknown fields in an API body are accepted or crash with a 500.
- A rejected write (bad currency, unknown payer, unavailable rate) partially persists.

## Share links and access
- A trip id is short, sequential or derived from the name, so other trips' links can be guessed.
- A malformed or unknown trip link renders an empty trip or a 500 instead of a 404, on the page and on every trip API.
- Someone with one trip's link edits or deletes an expense from another trip by swapping the expense id.
- A tab with an old copy of an expense deletes it after someone else changed it (deletes must carry the version and get a 409 when stale).
- The rate preview works without a real trip, making the site an open exchange-rate proxy.
- People on a shared link can rename, add or remove trip members (only the author can, from the admin).
- Creating trips or changing members works without the author session.
- The admin trip list misses a trip, or shows a stale expense count or yen total.
- The share link is copied wrong or the copy button fails silently.
- The share page is indexed by search engines (it must send `noindex`), leaks its URL in `Referer` to other sites, or is linked from site navigation.
- Descriptions and names render as HTML instead of text.

## Layout and runtime
- At 390 px the expense list, balances or settle-up table force horizontal scrolling.
- Long descriptions or names overflow their cells.
- Runtime or console errors on the admin pages or share page.
- An expense added on the share page is missing after reload or from the admin view.
- Perf: the trip code adds JavaScript to other public routes (only `/trips/<id>` may load the expense form).
