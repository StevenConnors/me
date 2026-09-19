export const legacyStorySlugs = ['dfw-okc', 'newpoc', 'poc'] as const;

export function isLegacyStorySlug(slug: string): slug is (typeof legacyStorySlugs)[number] {
  return legacyStorySlugs.includes(slug as (typeof legacyStorySlugs)[number]);
}
