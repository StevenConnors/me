# Photo-Diary Scrollytelling Website — Product Requirements Document (PRD)

## 1  Purpose & Vision
Create a personal, open-source photography site that presents ~10 “moments” (to start) as an interactive vertical timeline.  
As the user scrolls, photos, text, and short audio/video snippets appear **and a Mapbox map pans (fly-to) to each GPS location**, giving viewers a sense of traveling with you. 

---

## 2  Goals & Success Criteria

| Goal | KPI / Acceptance |
|------|------------------|
| Immersive scrollytelling experience | ≥ 90 Lighthouse performance on desktop & mobile |
| Map synchronized with scroll | Map camera changes correctly for every entry; no jank |
| Simple content authoring | Add a new “moment” by pushing one MDX file + media assets |
| Zero-cost hosting (hobby tier) | Fits within Vercel Hobby limits (100 GB/mo bandwidth; free `next/image` quota)  |

---

## 3  Target Users
* **Primary** – Site owner (you)  
* **Secondary** – Friends browsing on modern browsers (evergreen only)

---

## 4  Feature List (MVP)

| Category | Requirement |
|----------|-------------|
| **Timeline UI** | Vertical center-aligned line with “chapters”; sticky caption block; Framer-Motion fade/slide/parallax animations |
| **Media Display** | Each chapter supports: 1 hero image *or* a small cluster (2-3); optional video (muted + loop); optional audio snippet |
| **Map Integration** | Mini Mapbox GL JS map; scroll triggers `map.flyTo({ center, zoom })` |
| **Scroll Triggers** | IntersectionObserver (or Framer `useInView`) toggles `active` state & fires map events |
| **Content Source** | `/content/moments/YYYY-MM-DD-slug.mdx` with front-matter:<br>`title`, `date`, `location:{lat,lon}`, `images:[]`, `video?`, `audio?`, `summary` |
| **Images** | Stored under `/public/images`, served via `next/image` (Vercel optimization) |
| **Video / Audio** | Self-hosted in `/public/media`; total bandwidth ≤ 100 GB/mo |
| **Styling** | Tailwind CSS 3 + shadcn/ui; minimal white theme |
| **SEO / Social** | OG tags for first hero image & title |

---

## 5  Non-Functional Requirements
* **Performance** – FCP ≤ 2 s on 4 G; images lazy-loaded.  
* **Accessibility** – basic `alt` text & keyboard navigation.  
* **Browser Support** – evergreen (ES2020).  
* **Extensibility** – hooks in place for future vector-search (RAG) feature.

---

## 6  Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | **Next.js 14 / React 19** | Deployed on Vercel; React 19 adds built-in Actions & improved async transitions  |
| Animations | **Framer Motion v11** | Declarative & beginner-friendly |
| Mapping | **Mapbox GL JS v3** | Free tier sufficient; fly-to API ideal for scrollytelling |
| Styling | **Tailwind CSS 3 + shadcn/ui** | Rapid prototyping; accessible components |
| Content | **MDX files** | Simple, version-controlled |
| Hosting / CDN | **Vercel Hobby** | Free bandwidth & image optimization |

---

## 7  Milestones & Timeline

| Week | Deliverable |
|------|-------------|
| **1** | Repo bootstrapped (Next.js 14, Tailwind, shadcn); sample MDX loader |
| **2** | Timeline component + basic Framer Motion animations |
| **3** | Mapbox component; scroll-sync (fly-to) working |
| **4** | Media loaders: `next/image`, video & audio player styling |
| **5** | Add first 10 “moments”; responsive polishing |
| **6** | QA, Lighthouse optimization, public GitHub launch (MIT license) |

---

## 8  Risks & Open Items
* **Bandwidth spikes** – monitor Vercel usage; move large videos to YouTube if needed.  
* **Mapbox token limits** – 50 k map loads/month; monitor.  
* **MDX schema** – revisit `hero` flag once varied layouts are needed.

---

## 9  Future Enhancements (v2+)
1. Global map overview page with clustered markers; click zooms to entry.  
2. Tag & search via image embeddings (“Show me snow photos”).  
3. Offline PWA / print-to-PDF diary export.

---

## 10  Acceptance Checklist (MVP)

- [ ] Builds without TypeScript errors (Vercel preview).  
- [ ] Scrolling triggers correct map fly-to at every entry.  
- [ ] All media lazy-loads; no console 404s.  
- [ ] Lighthouse ≥ 90 performance score.  
- [ ] README documents how to add a new moment via MDX.