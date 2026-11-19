---
name: blast-radius
description: Find what a change could break outside its diff and prove the one fact that makes it safe by running real code. Use for "what could this break", for diffs touching shared code (lib/, auth, middleware, schemas, next.config.js, layouts), and from self-review on risky diffs.
---

# Blast radius

Adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack) (MIT).

Listing callers is not the job; grep does that in a second. The job is the breakage grep won't show. A writeup that sounds right is worthless on its own, so prove the facts the change depends on.

## How sure are you
For each fact the change's safety depends on, get it as far down this list as is cheap, and say where it stopped:
1. You said so (worthless alone).
2. You pointed at the line: a real `file:line`, or the library's source in `node_modules`.
3. You walked the failure step by step and showed it can't happen.
4. You ran it: a script or test that calls the real code and fails loudly if you're wrong.
5. You reproduced it in the running app (E2E spec or dev server).

## Steps
1. **Read the change**: the diff, symbols added/changed/deleted, and what now behaves differently that the diff doesn't spell out.
2. **Find the one fact it's safe because of** (e.g. "this query only adds a filter on an indexed field"). If it holds, most risks clear at once. Spend your time here.
3. **Look where grep stops** in this repo:
   - MongoDB documents already stored in the old shape (`media_assets`, `photos_pages`, journeys, `travel`); schema changes must read existing data.
   - JSON returned by `app/api/**` and read by client components or the admin editor.
   - Server vs client boundary: props passed from Server Components must be serializable; `"use client"` changes what ships to every route.
   - Caching and rendering mode (static vs dynamic, `revalidate`), `middleware`, NextAuth callbacks.
   - `E2E_TEST_MODE` paths that must stay inert in production.
   - Pinned library versions and their source (Next.js 15, React 19, Tiptap, Zod).
4. **Be honest about each risk**: real likelihood, real cost. Cite `file:line`. A search that finds nothing is still an answer; never invent a caller or API.
5. **Prove the one fact**: write and run a script or test against the real code, and paste the output.

## Hand back
- **What it does**, including the non-obvious part.
- **The one fact it's safe because of**: which step it reached, and the proof, or "unproven".
- **Risks**: how it breaks, `file:line`, likelihood and cost, how to check.
- **Cleared**: what you checked and why it's fine.
- **Before merge**: the cheapest test or repro that would catch the real bug.
