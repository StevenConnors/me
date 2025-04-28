Thoughts out loud

# Minimal Thought Log Website – Product Requirements Document (PRD)

## 1. Purpose
Create a minimalist public website that presents a reverse‑chronological stream of personal “thought” entries stored in MongoDB.  The site is read‑only for visitors; a private write API is exposed for the owner to add new thoughts.

## 2. Goals & Non‑Goals
| Goal | Measure of Success |
|------|-------------------|
| Serve the **latest 50 thoughts** quickly | First paint ⩽ 300 ms on typical broadband |
| **Infinite scrolling** loads additional batches seamlessly | Subsequent batches ⩽ 500 ms |
| **Markdown rendering** with basic formatting | Headers, bold/italic, links, lists render correctly |
| Minimal, distraction‑free design | < 30 kb CSS; Lighthouse score ⩽ 95 |
| Secure private write endpoint | Only requests with valid API key succeed |

Out of Scope for v1: full‑text search, rich media uploads, comments, authentication for readers.

## 3. Personas
* **Owner (Admin)** – adds thoughts via CLI or script hitting the write API.
* **Visitor** – browses and searches the public timeline.

## 4. Functional Requirements

### 4.1 Public Read Flow
1. On initial page load:
   * Fetch `GET /api/thoughts?limit=50` → returns newest 50 entries ordered by `createdAt` DESC.
2. As the user scrolls near bottom:
   * Front‑end issues `GET /api/thoughts?cursor=<ISO_Date>&limit=50`.
3. Response structure:
   ```json
   {
     "data": [ { "_id": "...", "text": "...", "createdAt": "2025-04-28T00:00:00Z" } ],
     "nextCursor": "2025-04-27T11:42:10Z" | null
   }
   ```

### 4.2 Private Write Flow
* Endpoint: `POST /api/thoughts`
* Auth: `X-API-KEY` header (random 32‑byte token stored in env var).
* Payload: `{ "text": "raw markdown" }`
* Server stamps `createdAt = now()` in UTC.

### 4.3 Markdown Rendering
* Use **remark** + **rehype** (or `next-mdx-remote`) on the client.
* Allow standard inline/block elements; sanitise HTML to prevent XSS.

## 5. Data Model (MongoDB `thoughts` collection)

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | Primary key |
| `text` | String | Raw Markdown |
| `createdAt` | Date | Index: `{ createdAt: -1 }` |

## 6. System Architecture

```
[Browser]
   │  HTTPS
   ▼
[Vercel Edge / Next.js 14 App Router]
   │  (Serverless / Edge Function)
   ▼
[MongoDB Atlas]  ← (Private write via same Edge runtime)
```

* **Edge Function** for GET to minimise latency worldwide.
* **Serverless Function** for POST (kept in same repo, shielded by API key).

## 7. UI / UX Guidelines

| Area | Decision |
|------|----------|
| Layout | Single centred column (max‑width = 48rem) |
| Font | `system-ui, -apple-system, Segoe UI, Roboto, sans-serif` |
| Palette | `#121212` text on `#FFFFFF` background; links `#2563EB` |
| Spacing | 1 rem gutters; 2 rem between entries |
| Breakpoints | Works on 320 px wide screens (iPhone SE) upward |
| Interaction | Infinite scroll with `react-intersection-observer`; subtle fade‑in on load |

## 8. API Contract Details

| Endpoint | Method | Auth | Query/Body | Response |
|----------|--------|------|------------|----------|
| `/api/thoughts` | GET | None | `limit` (int, default 50, max 100) <br>`cursor` (ISO Date, optional) | 200 JSON as above |
| `/api/thoughts` | POST | `X-API-KEY` | `text` (string, required) | 201 `{ "_id": "...", "createdAt": "..." }` <br>403 on invalid key |

## 9. Security & Privacy
* Store API key in Vercel Environment Variables.
* Rate‑limit POST to 10 req/min via simple in‑memory counter (future: Vercel KV / Upstash).
* Helmet-like headers via Next.js Config (`Content-Security-Policy`, `Referrer-Policy`).

## 10. Deployment & Ops
* Single Vercel project with `production` branch.
* Automatic previews on PRs.
* MongoDB Atlas “M0” free tier to start.
* Logging: `console.log` (viewable in Vercel), MongoDB metrics.

## 11. Milestones

| Phase | Deliverable | Owner | ETA |
|-------|-------------|-------|-----|
| 1 | Repo scaffold, data model, write endpoint | Dev | +1 day |
| 2 | Read API & basic UI w/ infinite scroll | Dev | +2 days |
| 3 | Markdown rendering, styling polish | Dev | +3 days |
| 4 | Smoke tests & README | Dev | +4 days |

## 12. Future Enhancements
* Full‑text search via MongoDB Atlas Search.
* Tagging & filtering.
* Optional dark mode toggle.
* Static generation of headless RSS/Atom feed.

---

**Open Questions**

1. Should we persist any rendered HTML for caching, or always render on client?
2. Acceptable maximum document size? (Large posts may affect bundle size.)
3. Any analytics or privacy banner needed in future?

