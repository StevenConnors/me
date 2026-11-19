import type { Journey } from './schemas';

type ReleaseContent = Pick<Journey, 'title' | 'slug' | 'summary' | 'draftDocument' | 'social'> & {
  cover?: Journey['cover'] | null;
  experiencedAt?: Journey['experiencedAt'] | null;
  locations?: Journey['locations'];
};

/** Ignore editing versions and object-key order when comparing a draft to a release. */
export function journeyReleaseSnapshot(journey: ReleaseContent): string {
  return JSON.stringify({
    title: journey.title,
    slug: journey.slug,
    summary: journey.summary || undefined,
    cover: journey.cover ?? undefined,
    experiencedAt: journey.experiencedAt ?? undefined,
    locations: journey.locations ?? [],
    social: journey.social,
    draftDocument: journey.draftDocument,
  }, (_key, value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).filter(([, nested]) => nested !== undefined).sort(([left], [right]) => left.localeCompare(right)));
  });
}
