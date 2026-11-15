import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { mapVoiceError, parseJsonBody, recordingIdOrNull, safeRecording, workerUnauthorized } from '@/lib/voice/api';
import { VoiceRepository } from '@/lib/voice/repository';

export const runtime = 'nodejs';
type Context = { params: Promise<{ recordingId: string }> };
const HeartbeatSchema = z.object({ claimId: z.string().uuid() }).strict();

export async function POST(request: NextRequest, context: Context) {
  const unauthorized = await workerUnauthorized(request);
  if (unauthorized) return unauthorized;
  const { recordingId: raw } = await context.params;
  const recordingId = recordingIdOrNull(raw);
  if (!recordingId) return NextResponse.json({ error: { code: 'INVALID_RECORDING_ID', message: 'Recording ID is invalid' } }, { status: 400 });
  const parsed = await parseJsonBody(request, HeartbeatSchema, 2_000);
  if (parsed.response) return parsed.response;
  try {
    const recording = await (await VoiceRepository.connect()).heartbeat(recordingId, parsed.value.claimId);
    return NextResponse.json({ recording: safeRecording(recording), leaseExpiresAt: recording.leaseExpiresAt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const mapped = mapVoiceError(error);
    if (mapped) return mapped;
    console.error('Unable to renew voice transcription claim', error);
    return NextResponse.json({ error: { code: 'HEARTBEAT_FAILED', message: 'Unable to renew this transcription claim' } }, { status: 503 });
  }
}
