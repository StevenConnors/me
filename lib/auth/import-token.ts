import { createHash, timingSafeEqual } from 'node:crypto';

export const MIN_IMPORT_TOKEN_LENGTH = 32;

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * The Mac import script authenticates with a long shared secret instead of the
 * author's GitHub session. An unset or short token disables import entirely.
 */
export function isValidImportToken(
  authorizationHeader: string | null,
  configuredToken = process.env.PHOTOS_IMPORT_TOKEN,
): boolean {
  const expected = configuredToken?.trim();
  if (!expected || expected.length < MIN_IMPORT_TOKEN_LENGTH) return false;
  const presented = /^Bearer (\S+)$/.exec(authorizationHeader?.trim() ?? '')?.[1];
  if (!presented) return false;
  return timingSafeEqual(digest(presented), digest(expected));
}
