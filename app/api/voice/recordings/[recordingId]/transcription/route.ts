import { NextRequest, NextResponse } from 'next/server';

import { mapVoiceError, parseJsonBody, recordingIdOrNull, safeRecording, workerUnauthorized } from '@/lib/voice/api';
import { VoiceTranscriptSchema } from '@/lib/voice/schema';
import { VoiceRepository } from '@/lib/voice/repository';

export const runtime = 'nodejs';
type Context = { params: Promise<{ recordingId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const unauthorized = await workerUnauthorized(request);
  if (unauthorized) return unauthorized;
  const { recordingId: raw } = await context.params;
  const recordingId = recordingIdOrNull(raw);
  if (!recordingId) return NextResponse.json({ error: { code: 'INVALID_RECORDING_ID', message: 'Recording ID is invalid' } }, { status: 400 });
  const parsed = await parseJsonBody(request, VoiceTranscriptSchema);
  if (parsed.response) return parsed.response;
  try {
    const recording = await (await VoiceRepository.connect()).submit(recordingId, parsed.value.claimId, parsed.value);
    return NextResponse.json({ recording: safeRecording(recording) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const mapped = mapVoiceError(error);
    if (mapped) return mapped;
    console.error('Unable to submit voice transcription', error);
    return NextResponse.json({ error: { code: 'TRANSCRIPTION_FAILED', message: 'Unable to save this transcript right now' } }, { status: 503 });
  }
}
