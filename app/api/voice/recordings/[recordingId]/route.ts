import { NextRequest, NextResponse } from 'next/server';

import { recordingIdOrNull, safeRecording, voiceWorkerOwnerId, workerUnauthorized } from '@/lib/voice/api';
import { VoiceRepository } from '@/lib/voice/repository';

export const runtime = 'nodejs';
type Context = { params: Promise<{ recordingId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const unauthorized = await workerUnauthorized(request);
  if (unauthorized) return unauthorized;
  const { recordingId: raw } = await context.params;
  const recordingId = recordingIdOrNull(raw);
  if (!recordingId) return NextResponse.json({ error: { code: 'INVALID_RECORDING_ID', message: 'Recording ID is invalid' } }, { status: 400 });
  const ownerId = voiceWorkerOwnerId();
  if (!ownerId) return NextResponse.json({ error: { code: 'WORKER_UNAVAILABLE', message: 'Worker access is not configured' } }, { status: 503 });
  try {
    const recording = await (await VoiceRepository.connect()).findOwned(recordingId, ownerId);
    if (!recording) return NextResponse.json({ error: { code: 'RECORDING_NOT_FOUND', message: 'This recording was not found' } }, { status: 404 });
    return NextResponse.json({ recording: safeRecording(recording) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Unable to load voice recording', error);
    return NextResponse.json({ error: { code: 'RECORDING_UNAVAILABLE', message: 'Unable to load this recording right now' } }, { status: 503 });
  }
}
