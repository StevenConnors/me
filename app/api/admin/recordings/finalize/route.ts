import { head } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireVoiceAuthor, parseJsonBody, mapVoiceError, safeRecording } from '@/lib/voice/api';
import { normalizeVoiceMimeType } from '@/lib/voice/schema';
import { VoiceRepository } from '@/lib/voice/repository';

export const runtime = 'nodejs';
const FinalizeSchema = z.object({ recordingId: z.string().regex(/^[a-f\d]{24}$/i) }).strict();

export async function POST(request: Request) {
  const authorization = await requireVoiceAuthor();
  if (authorization.response) return authorization.response;
  const parsed = await parseJsonBody(request, FinalizeSchema, 2_000);
  if (parsed.response) return parsed.response;
  try {
    const repository = await VoiceRepository.connect();
    const record = await repository.findOwned(parsed.value.recordingId, authorization.ownerId!);
    if (!record) return NextResponse.json({ error: { code: 'RECORDING_NOT_FOUND', message: 'This recording was not found' } }, { status: 404 });
    if (record.status !== 'uploading' && record.blobUrl) return NextResponse.json({ recording: safeRecording(record) });
    const blob = await head(record.blobPathname, { token: process.env.VOICE_BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_READ_WRITE_TOKEN?.trim() });
    const expectedMime = normalizeVoiceMimeType(record.mimeType, record.originalFilename);
    if (!new URL(blob.url).hostname.endsWith('.private.blob.vercel-storage.com')) {
      return NextResponse.json({ error: { code: 'PRIVATE_STORAGE_REQUIRED', message: 'Voice recordings must use private Blob storage' } }, { status: 503 });
    }
    if (blob.pathname !== record.blobPathname || blob.size !== record.byteSize || blob.contentType !== expectedMime) {
      return NextResponse.json({ error: { code: 'UPLOAD_MISMATCH', message: 'The stored audio does not match this upload' } }, { status: 409 });
    }
    const finalized = await repository.finalize(record._id, authorization.ownerId!, blob.url, blob.size, blob.contentType);
    return NextResponse.json({ recording: safeRecording(finalized) });
  } catch (error) {
    const mapped = mapVoiceError(error);
    if (mapped) return mapped;
    if (error instanceof Error && error.message.toLowerCase().includes('not found')) {
      return NextResponse.json({ error: { code: 'BLOB_NOT_FOUND', message: 'The audio upload is not ready yet; retry finalization shortly' } }, { status: 409 });
    }
    console.error('Unable to finalize voice upload', error);
    return NextResponse.json({ error: { code: 'UPLOAD_FINALIZATION_FAILED', message: 'Unable to verify this upload right now' } }, { status: 503 });
  }
}
