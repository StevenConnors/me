export const MIN_THEME_PHOTOS = 5;
export const MAX_THEMES = 16;

export type PhotoTheme = { tag: string; count: number };

/** Tags shared by enough published photos to be worth browsing, most common first. */
export function photoThemes(photos: ReadonlyArray<{ tags: readonly string[] }>): PhotoTheme[] {
  const counts = new Map<string, number>();
  for (const photo of photos) {
    for (const tag of Array.from(new Set(photo.tags))) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return Array.from(counts, ([tag, count]) => ({ tag, count }))
    .filter((theme) => theme.count >= MIN_THEME_PHOTOS)
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
    .slice(0, MAX_THEMES);
}
