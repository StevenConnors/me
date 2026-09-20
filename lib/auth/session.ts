import { getServerSession } from 'next-auth';

import { authOptions } from '@/auth';
import { isAllowedAuthor } from '@/lib/auth/admin';
import { E2E_AUTHOR_SESSION, isE2ETestMode } from '@/lib/e2e/test-mode';

export async function getAuthorSession() {
  if (isE2ETestMode()) return E2E_AUTHOR_SESSION;
  const session = await getServerSession(authOptions);
  return isAllowedAuthor(session?.user) ? session : null;
}

export async function hasAuthorSession(): Promise<boolean> {
  return Boolean(await getAuthorSession());
}
