import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiError } from '@/lib/http/admin-api';
import { getAuthorSession } from '@/lib/auth/session';
import { isE2ETestMode } from '@/lib/e2e/test-mode';
import type { VoiceRecording } from '@/lib/voice/schema';

const DUMMY_TOKEN = 'voice-worker-not-configured-dummy-token-0000000000';

export async function requireVoiceWorker(request: Request): Promise<boolean> {
  const configured = process.env.VOICE_TRANSCRIBER_API_TOKEN?.trim();
  const expected = configured && configured.length >= 32 ? configured : DUMMY_TOKEN;
  const authorization = request.headers.get('authorization') ?? '';
  const supplied = /^Bearer ([^\s]+)$/i.exec(authorization)?.[1] ?? '';
  const actualBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  const comparable = actualBytes.length === expectedBytes.length ? actualBytes : Buffer.alloc(expectedBytes.length);
  const bytesEqual = timingSafeEqual(comparable, expectedBytes);
  const equal = actualBytes.length === expectedBytes.length && bytesEqual;
  return Boolean(configured && configured.length >= 32 && supplied && equal);
}

export async function workerUnauthorized(request: Request) {
  if (await requireVoiceWorker(request)) return null;
  return apiError('UNAUTHORIZED', 'Valid transcription worker credentials are required', 401);
}

export function voiceWorkerOwnerId() {
  const ownerId = isE2ETestMode() ? 'e2e-author' : process.env.ADMIN_GITHUB_ID?.trim();
  return ownerId || null;
}

export async function requireVoiceAuthor() {
  const session = await getAuthorSession();
  if (!session?.user?.id) return { ownerId: null, response: apiError('UNAUTHORIZED', 'Sign in as the configured author to continue', 401) };
  return { ownerId: String(session.user.id), response: null };
}

export async function parseJsonBody<T>(request: Request, schema: z.ZodType<T>, maxBytes = 4_000_000): Promise<{ value: T; response: null } | { value: null; response: NextResponse }> {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { value: null, response: apiError('REQUEST_TOO_LARGE', 'The request body exceeds the allowed size', 413) };
  }
  let text: string;
  try { text = await request.text(); } catch { return { value: null, response: apiError('INVALID_JSON', 'The request body is invalid', 400) }; }
  if (Buffer.byteLength(text, 'utf8') > maxBytes) return { value: null, response: apiError('REQUEST_TOO_LARGE', 'The request body exceeds the allowed size', 413) };
  let json: unknown;
  try { json = JSON.parse(text); } catch { return { value: null, response: apiError('INVALID_JSON', 'The request body must be valid JSON', 400) }; }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { value: null, response: apiError('INVALID_REQUEST', 'The request body is invalid', 400, parsed.error.issues) };
  return { value: parsed.data, response: null };
}

export function safeRecording(recording: VoiceRecording) {
  const { claimId: _claimId, leaseExpiresAt: _lease, lastCompletedClaimId: _completedClaim, transcriptionError, ownerId: _ownerId, blobUrl: _blobUrl, blobPathname: _blobPathname, ...safe } = recording;
  return { ...safe, ...(transcriptionError ? { error: transcriptionError.slice(0, 2_000) } : {}) };
}

export function recordingIdOrNull(id: string) {
  return /^[a-f\d]{24}$/i.test(id) ? id.toLowerCase() : null;
}

export function mapVoiceError(error: unknown) {
  const name = error instanceof Error ? error.constructor.name : '';
  if (name === 'VoiceNotFoundError') return apiError('RECORDING_NOT_FOUND', 'This recording was not found', 404);
  if (name === 'VoiceConflictError') return apiError('RECORDING_CONFLICT', error instanceof Error ? error.message : 'The recording changed', 409);
  return null;
}
