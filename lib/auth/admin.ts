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
