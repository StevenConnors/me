import { NextResponse } from 'next/server';

import { isValidImportToken } from '@/lib/auth/import-token';
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

/** Endpoints only the Mac import script calls. The author session is not enough. */
export function requireImportApi(request: Request) {
  if (isValidImportToken(request.headers.get('authorization'))) return { response: null } as const;
  return { response: apiError('UNAUTHORIZED', 'A valid import token is required', 401) } as const;
}

/** Media upload steps shared by the editor and the Mac import script. */
export async function requireAuthorOrImportApi(request: Request) {
  if (isValidImportToken(request.headers.get('authorization'))) return { response: null } as const;
  return requireAuthorApi();
}
