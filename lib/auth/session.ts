import { getServerSession, type Session } from 'next-auth';
import { cookies } from 'next/headers';

import { authOptions } from '@/auth';
import { adminRoleFor, isAuthorAuthenticationConfigured, type AdminRole } from '@/lib/auth/admin';
import { E2E_ADMIN_ROLE_COOKIE, E2E_AUTHOR_SESSION, isE2ETestMode } from '@/lib/e2e/test-mode';

export async function getAdminSession(): Promise<{ session: Session; role: AdminRole } | null> {
  if (isE2ETestMode()) {
    const role = (await cookies()).get(E2E_ADMIN_ROLE_COOKIE)?.value === 'viewer' ? 'viewer' : 'author';
    return { session: E2E_AUTHOR_SESSION, role };
  }
  if (!isAuthorAuthenticationConfigured()) return null;
  const session = await getServerSession(authOptions);
  const role = adminRoleFor(session?.user);
  return session && role ? { session, role } : null;
}

export async function getAuthorSession() {
  const admin = await getAdminSession();
  return admin?.role === 'author' ? admin.session : null;
}

export async function hasAuthorSession(): Promise<boolean> {
  return Boolean(await getAuthorSession());
}
