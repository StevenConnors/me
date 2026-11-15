import { NextRequest, NextResponse } from 'next/server';

import { mapVoiceError, parseJsonBody, recordingIdOrNull, safeRecording, workerUnauthorized } from '@/lib/voice/api';
import { VoiceFailureSchema } from '@/lib/voice/schema';
import { VoiceRepository } from '@/lib/voice/repository';

export const runtime = 'nodejs';
type Context = { params: Promise<{ recordingId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const unauthorized = await workerUnauthorized(request);
  if (unauthorized) return unauthorized;
  const { recordingId: raw } = await context.params;
  const recordingId = recordingIdOrNull(raw);
  if (!recordingId) return NextResponse.json({ error: { code: 'INVALID_RECORDING_ID', message: 'Recording ID is invalid' } }, { status: 400 });
  const parsed = await parseJsonBody(request, VoiceFailureSchema, 10_000);
  if (parsed.response) return parsed.response;
  try {
    const recording = await (await VoiceRepository.connect()).fail(recordingId, parsed.value.claimId, parsed.value.error);
    return NextResponse.json({ recording: safeRecording(recording) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const mapped = mapVoiceError(error);
    if (mapped) return mapped;
    console.error('Unable to record voice transcription failure', error);
    return NextResponse.json({ error: { code: 'FAILURE_UPDATE_FAILED', message: 'Unable to update this recording right now' } }, { status: 503 });
  }
}
