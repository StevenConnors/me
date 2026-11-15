import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { head } from '@vercel/blob';

import { requireVoiceAuthor } from '@/lib/voice/api';
import { VoiceMetadataSchema, getVoiceFileExtension, normalizeVoiceMimeType } from '@/lib/voice/schema';
import { VoiceConflictError, VoiceRepository } from '@/lib/voice/repository';

export const runtime = 'nodejs';

const ClientPayloadSchema = VoiceMetadataSchema;
const TokenPayloadSchema = z.object({ ownerId: z.string().min(1).max(200), metadata: VoiceMetadataSchema, pathname: z.string().min(1).max(400) }).strict();
const blobToken = () => process.env.VOICE_BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_READ_WRITE_TOKEN?.trim();

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > 16_000) return NextResponse.json({ error: { code: 'REQUEST_TOO_LARGE', message: 'The upload authorization request is too large' } }, { status: 413 });
  let body: HandleUploadBody;
  try {
    const serialized = await request.text();
    if (Buffer.byteLength(serialized, 'utf8') > 16_000) return NextResponse.json({ error: { code: 'REQUEST_TOO_LARGE', message: 'The upload authorization request is too large' } }, { status: 413 });
    body = JSON.parse(serialized) as HandleUploadBody;
  } catch { return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'The upload request is invalid' } }, { status: 400 }); }
  if (body?.type !== 'blob.upload-completed') {
    const authorization = await requireVoiceAuthor();
    if (authorization.response) return authorization.response;
  }
  const token = blobToken();
  if (!token) return NextResponse.json({ error: { code: 'BLOB_NOT_CONFIGURED', message: 'Private voice storage is not configured' } }, { status: 503 });

  try {
    const result = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const authorization = await requireVoiceAuthor();
        if (authorization.response) throw new Error('Not authorized to upload recordings');
        let untrusted: unknown;
        try { untrusted = JSON.parse(clientPayload ?? ''); } catch { throw new Error('Invalid upload metadata'); }
        const metadata = ClientPayloadSchema.parse(untrusted);
        const mimeType = normalizeVoiceMimeType(metadata.mimeType, metadata.originalFilename);
        if (!mimeType) throw new Error('Unsupported voice memo file type');
        if (mimeType !== metadata.mimeType) metadata.mimeType = mimeType;
        const extension = getVoiceFileExtension(metadata.originalFilename);
        const expectedPath = `voice/${metadata.recordingId}/original${extension}`;
        if (pathname !== expectedPath) throw new Error('Upload pathname does not match the recording');
        const repository = await VoiceRepository.connect();
        const record = await repository.reserve(authorization.ownerId!, metadata, expectedPath);
        if (record.status !== 'uploading') throw new Error('This recording has already been uploaded');
        return {
          allowedContentTypes: [mimeType],
          maximumSizeInBytes: metadata.byteSize,
          validUntil: Date.now() + 10 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ ownerId: authorization.ownerId, metadata: { ...metadata, mimeType }, pathname: expectedPath }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) throw new Error('Upload authorization metadata is missing');
        const payload = TokenPayloadSchema.parse(JSON.parse(tokenPayload));
        const stored = await head(payload.pathname, { token });
        const storedHost = new URL(stored.url).hostname;
        if (!storedHost.endsWith('.private.blob.vercel-storage.com')) throw new Error('Voice recordings must use private Blob storage');
        if (blob.pathname !== payload.pathname || stored.pathname !== payload.pathname || stored.size !== payload.metadata.byteSize || stored.contentType !== payload.metadata.mimeType) {
          throw new Error('Uploaded file details do not match the authorized recording');
        }
        await (await VoiceRepository.connect()).finalize(payload.metadata.recordingId, payload.ownerId, stored.url, stored.size, stored.contentType);
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof VoiceConflictError) return NextResponse.json({ error: { code: 'UPLOAD_CONFLICT', message: error.message } }, { status: 409 });
    const name = error instanceof Error ? error.name : '';
    if (name === 'ZodError' || error instanceof SyntaxError || error instanceof TypeError) {
      return NextResponse.json({ error: { code: 'INVALID_UPLOAD', message: 'The selected audio file or upload request is invalid' } }, { status: 400 });
    }
    console.error('Unable to authorize voice upload', error);
    return NextResponse.json({ error: { code: 'UPLOAD_AUTHORIZATION_FAILED', message: 'Unable to prepare this upload right now' } }, { status: 400 });
  }
}
