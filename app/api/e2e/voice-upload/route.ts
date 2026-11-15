import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextResponse } from 'next/server';

import { requireVoiceAuthor } from '@/lib/voice/api';
import { isE2ETestMode } from '@/lib/e2e/test-mode';
import { getVoiceFileExtension, normalizeVoiceMimeType, VOICE_MAX_BYTES } from '@/lib/voice/schema';
import { VoiceRepository } from '@/lib/voice/repository';
import { safeRecording } from '@/lib/voice/api';
import { VoiceMetadataSchema } from '@/lib/voice/schema';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isE2ETestMode()) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  const authorization = await requireVoiceAuthor();
  if (authorization.response) return authorization.response;
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: { code: 'INVALID_FILE', message: 'Choose an audio file' } }, { status: 400 });
    const metadata = VoiceMetadataSchema.parse({
      recordingId: form.get('recordingId'), originalFilename: file.name, mimeType: file.type,
      byteSize: file.size, title: form.get('title') || undefined, notes: form.get('notes') || undefined,
    });
    if (file.size > VOICE_MAX_BYTES) return NextResponse.json({ error: { code: 'FILE_TOO_LARGE', message: 'Audio files must be 250 MB or smaller' } }, { status: 413 });
    const mimeType = normalizeVoiceMimeType(metadata.mimeType, metadata.originalFilename);
    const extension = getVoiceFileExtension(metadata.originalFilename);
    if (!mimeType || !extension) return NextResponse.json({ error: { code: 'UNSUPPORTED_FILE', message: 'Choose a supported audio file' } }, { status: 400 });
    metadata.mimeType = mimeType;
    const pathname = `voice/${metadata.recordingId}/original${extension}`;
    const repository = await VoiceRepository.connect();
    const bytes = Buffer.from(await file.arrayBuffer());
    const existing = await repository.findOwned(metadata.recordingId, authorization.ownerId!);
    const folder = join(tmpdir(), 'voice-e2e-uploads');
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const audioPath = join(folder, `${metadata.recordingId}.audio`);
    if (existing && existing.status !== 'uploading') {
      const previous = await readFile(audioPath).catch(() => null);
      if (!previous || !previous.equals(bytes) || existing.byteSize !== bytes.length) {
        return NextResponse.json({ error: { code: 'UPLOAD_CONFLICT', message: 'This recording has already been uploaded' } }, { status: 409 });
      }
      return NextResponse.json({ recording: safeRecording(existing) });
    }
    const record = await repository.reserve(authorization.ownerId!, metadata, pathname);
    try { await writeFile(audioPath, bytes, { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      const previous = await readFile(audioPath);
      if (!previous.equals(bytes)) return NextResponse.json({ error: { code: 'UPLOAD_CONFLICT', message: 'This recording already has different audio bytes' } }, { status: 409 });
    }
    const saved = await repository.finalize(record._id, authorization.ownerId!, `e2e-private://${metadata.recordingId}`, bytes.length, mimeType);
    return NextResponse.json({ recording: safeRecording(saved) }, { status: 201 });
  } catch (error) {
    console.error('Unable to store E2E voice upload', error);
    return NextResponse.json({ error: { code: 'E2E_UPLOAD_FAILED', message: 'Unable to upload this recording' } }, { status: 400 });
  }
}
