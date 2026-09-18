import { getServerSession } from 'next-auth';

import { authOptions } from '@/auth';
import { isAllowedAuthor } from '@/lib/auth/admin';

export async function getAuthorSession() {
  const session = await getServerSession(authOptions);
  return isAllowedAuthor(session?.user) ? session : null;
}

export async function hasAuthorSession(): Promise<boolean> {
  return Boolean(await getAuthorSession());
}
