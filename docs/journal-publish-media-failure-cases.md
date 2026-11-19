# Journal publish media reads

- Publishing a photo-heavy journal makes one media read per unique asset instead of one batch.
- Missing assets lose their placement-specific errors or change issue order and messages.
- Pending, failed, or archived assets publish, or report different errors.
- Repeated cover, social, and chapter references lose duplicate validation issues.
- Ready assets fail publication when Mongo returns them in a different order.
- A journal with no media references fails the media lookup.

The existing publication API E2E covers successful persistence and replay. Repository-level Vitest tests cover query counts and validation details against disposable Mongo.
