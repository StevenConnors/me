import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { mapVoiceError, parseJsonBody, recordingIdOrNull, safeRecording, workerUnauthorized } from '@/lib/voice/api';
import { VoiceRepository } from '@/lib/voice/repository';

export const runtime = 'nodejs';
type Context = { params: Promise<{ recordingId: string }> };
const ClaimSchema = z.object({ force: z.boolean().optional().default(false) }).strict();

export async function POST(request: NextRequest, context: Context) {
  const unauthorized = await workerUnauthorized(request);
  if (unauthorized) return unauthorized;
  const { recordingId: raw } = await context.params;
  const recordingId = recordingIdOrNull(raw);
  if (!recordingId) return NextResponse.json({ error: { code: 'INVALID_RECORDING_ID', message: 'Recording ID is invalid' } }, { status: 400 });
  const parsed = await parseJsonBody(request, ClaimSchema, 2_000);
  if (parsed.response) return parsed.response;
  try {
    const result = await (await VoiceRepository.connect()).claim(recordingId, parsed.value.force);
    return NextResponse.json({ recording: safeRecording(result.recording), claimId: result.claimId, leaseExpiresAt: result.leaseExpiresAt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const mapped = mapVoiceError(error);
    if (mapped) return mapped;
    console.error('Unable to claim voice recording', error);
    return NextResponse.json({ error: { code: 'CLAIM_FAILED', message: 'Unable to claim this recording right now' } }, { status: 503 });
  }
}
