# Vercel Web Analytics failure cases

- A production build (`VERCEL_ENV=production`) fails because a Server Component passes the `beforeSend` function to the client `<Analytics />` component.
- Production pages never load `/_vercel/insights/script.js`, so the admin dashboard reports no visits.
- Preview, local and E2E builds load the tracker and send non-production traffic.
- `/admin` or `/admin/**` page views are sent to Web Analytics.
- Public paths that only start with the text `admin` (e.g. `/administrator`) are dropped.
- An unparsable event URL throws inside `beforeSend` and breaks tracking.
- The tracker adds measurable JS, LCP or TBT cost to public pages beyond the analytics script itself.
