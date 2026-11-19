import { NextResponse } from 'next/server';

import { getAdminSession } from '@/lib/auth/session';

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status },
  );
}

export async function requireAuthorApi() {
  const admin = await getAdminSession();
  if (!admin) {
    return {
      session: null,
      response: apiError('UNAUTHORIZED', 'Sign in as the configured author to continue', 401),
    } as const;
  }
  if (admin.role !== 'author') {
    return {
      session: null,
      response: apiError('READ_ONLY_ADMIN', 'This account has view-only admin access', 403),
    } as const;
  }

  return { session: admin.session, response: null } as const;
}

/** Author or read-only viewer; use only for handlers that never write. */
export async function requireAdminReadApi() {
  const admin = await getAdminSession();
  if (!admin) {
    return {
      session: null,
      response: apiError('UNAUTHORIZED', 'Sign in as the configured author to continue', 401),
    } as const;
  }

  return { session: admin.session, response: null } as const;
}
