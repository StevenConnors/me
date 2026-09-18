import { NextResponse } from 'next/server';

import { getAuthorSession } from '@/lib/auth/session';

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
  const session = await getAuthorSession();
  if (!session) {
    return {
      session: null,
      response: apiError('UNAUTHORIZED', 'Sign in as the configured author to continue', 401),
    } as const;
  }

  return { session, response: null } as const;
}
