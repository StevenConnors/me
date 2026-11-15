import { NextResponse } from 'next/server';

import { safeRecording, requireVoiceAuthor } from '@/lib/voice/api';
import { VoiceRepository } from '@/lib/voice/repository';

export const runtime = 'nodejs';

export async function GET() {
  const authorization = await requireVoiceAuthor();
  if (authorization.response) return authorization.response;
  try {
    const recordings = await (await VoiceRepository.connect()).listOwned(authorization.ownerId!);
    return NextResponse.json({ recordings: recordings.map(safeRecording) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Unable to list voice recordings', error);
    return NextResponse.json({ error: { code: 'RECORDINGS_UNAVAILABLE', message: 'Unable to load recordings right now' } }, { status: 503 });
  }
}
