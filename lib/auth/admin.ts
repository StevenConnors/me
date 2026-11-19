export type AuthorIdentity = {
  id?: string | null;
  email?: string | null;
};

/**
 * GitHub numeric IDs are stable even when an account's login or email changes.
 * The author allowlist is intentionally fail-closed when not configured.
 */
export function isAllowedAuthor(
  identity: AuthorIdentity | null | undefined,
  configuredGithubId = process.env.ADMIN_GITHUB_ID,
): boolean {
  return Boolean(
    configuredGithubId?.trim() &&
      identity?.id &&
      identity.id === configuredGithubId.trim(),
  );
}

export function isAuthorAuthenticationConfigured(
  environment: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  return Boolean(
    environment.AUTH_SECRET?.trim() &&
      environment.AUTH_GITHUB_ID?.trim() &&
      environment.AUTH_GITHUB_SECRET?.trim() &&
      environment.ADMIN_GITHUB_ID?.trim(),
  );
}

export type AdminRole = 'author' | 'viewer';

function parseGithubIds(configured: string | undefined): string[] {
  return (configured ?? '').split(',').map((id) => id.trim()).filter(Boolean);
}

/** Read-only admin accounts, configured as comma-separated immutable GitHub numeric IDs. */
export function isAllowedViewer(
  identity: AuthorIdentity | null | undefined,
  configuredGithubIds = process.env.ADMIN_VIEWER_GITHUB_IDS,
): boolean {
  return Boolean(identity?.id && parseGithubIds(configuredGithubIds).includes(identity.id));
}

export function adminRoleFor(
  identity: AuthorIdentity | null | undefined,
  configured: { author?: string; viewers?: string } = {
    author: process.env.ADMIN_GITHUB_ID,
    viewers: process.env.ADMIN_VIEWER_GITHUB_IDS,
  },
): AdminRole | null {
  if (isAllowedAuthor(identity, configured.author)) return 'author';
  if (isAllowedViewer(identity, configured.viewers)) return 'viewer';
  return null;
}
