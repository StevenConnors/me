import { NextRequest, NextResponse } from 'next/server';

import { recordingIdOrNull, safeRecording, voiceWorkerOwnerId, workerUnauthorized } from '@/lib/voice/api';
import { VoiceRepository } from '@/lib/voice/repository';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const unauthorized = await workerUnauthorized(request);
  if (unauthorized) return unauthorized;
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ error: { code: 'INVALID_LIMIT', message: 'limit must be an integer from 1 to 100' } }, { status: 400 });
  }
  try {
    const ownerId = voiceWorkerOwnerId();
    if (!ownerId) return NextResponse.json({ error: { code: 'WORKER_UNAVAILABLE', message: 'Worker access is not configured' } }, { status: 503 });
    const recordings = await (await VoiceRepository.connect()).listPending(limit);
    return NextResponse.json({ recordings: recordings.filter((recording) => recordingIdOrNull(recording._id)).map((recording) => ({
      ...safeRecording(recording), audioUrl: `/api/voice/recordings/${recording._id}/audio`,
    })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Unable to list pending voice recordings', error);
    return NextResponse.json({ error: { code: 'PENDING_UNAVAILABLE', message: 'Unable to load pending recordings right now' } }, { status: 503 });
  }
}
