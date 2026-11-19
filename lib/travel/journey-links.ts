import type { PublishedJourneySummary } from '@/lib/journeys/schemas';

export type TravelJourneyLink = { slug: string; title: string };
export type TravelJourneyLinks = Record<string, TravelJourneyLink[]>;

/** Published journeys per visited country code, keeping the newest-first order of `journeys`. */
export function journeyLinksByCountry(journeys: PublishedJourneySummary[]): TravelJourneyLinks {
  const links: TravelJourneyLinks = {};
  for (const journey of journeys) {
    const codes = Array.from(new Set(journey.locations.flatMap(({ countryCode }) => countryCode ? [countryCode] : [])));
    for (const code of codes) (links[code] ??= []).push({ slug: journey.slug, title: journey.title });
  }
  return links;
}
