import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { get, head } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

import { requireVoiceAuthor, voiceWorkerOwnerId, workerUnauthorized } from '@/lib/voice/api';
import { isE2ETestMode } from '@/lib/e2e/test-mode';
import { VoiceRepository } from '@/lib/voice/repository';

export const runtime = 'nodejs';
type Context = { params: Promise<{ recordingId: string }> };
type ByteRange = { start: number; end: number };

function parseRange(value: string | null, size: number): ByteRange | null | 'invalid' {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return 'invalid';
  const suffixLength = !match[1] ? Number(match[2]) : null;
  let start = match[1] ? Number(match[1]) : Math.max(0, size - suffixLength!);
  let end = match[1] && match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return 'invalid';
  end = Math.min(end, size - 1);
  return { start, end };
}

function contentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\\r\n]/g, '_') || 'recording.audio';
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function rangeError(size: number) {
  return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Cache-Control': 'private, no-store' } });
}

async function authorize(request: NextRequest) {
  const isWorker = await workerUnauthorized(request) === null;
  if (isWorker) {
    const ownerId = voiceWorkerOwnerId();
    return ownerId ? { ownerId, response: null } : { ownerId: null, response: new NextResponse('Worker not configured', { status: 503 }) };
  }
  const author = await requireVoiceAuthor();
  if (author.response) return { ownerId: null, response: author.response };
  return { ownerId: author.ownerId, response: null };
}

export async function GET(request: NextRequest, context: Context) {
  const { recordingId } = await context.params;
  if (!/^[a-f\d]{24}$/i.test(recordingId)) return new NextResponse('Invalid recording ID', { status: 400 });
  const authorization = await authorize(request);
  if (authorization.response) return authorization.response;
  try {
    const recording = await (await VoiceRepository.connect()).findOwned(recordingId.toLowerCase(), authorization.ownerId!);
    if (!recording || recording.status === 'uploading') return new NextResponse('Recording not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });

    if (isE2ETestMode() && recording.blobUrl?.startsWith('e2e-private://')) {
      const path = join(tmpdir(), 'voice-e2e-uploads', `${recording._id}.audio`);
      const details = await stat(path);
      const range = parseRange(request.headers.get('range'), details.size);
      if (range === 'invalid') return rangeError(details.size);
      const headers = new Headers({
        'Content-Type': recording.mimeType,
        'Content-Disposition': contentDisposition(recording.originalFilename),
        'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
      });
      if (range) {
        headers.set('Content-Range', `bytes ${range.start}-${range.end}/${details.size}`);
        headers.set('Content-Length', String(range.end - range.start + 1));
        return new NextResponse(Readable.toWeb(createReadStream(path, { start: range.start, end: range.end })) as ReadableStream, { status: 206, headers });
      }
      headers.set('Content-Length', String(details.size));
      return new NextResponse(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers });
    }

    if (!recording.blobPathname || !recording.blobUrl) return new NextResponse('Recording audio is unavailable', { status: 404 });
    const token = process.env.VOICE_BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) return new NextResponse('Private audio storage is not configured', { status: 503 });
    const metadata = await head(recording.blobPathname, { token });
    if (!new URL(metadata.url).hostname.endsWith('.private.blob.vercel-storage.com')) return new NextResponse('Private audio storage is unavailable', { status: 503 });
    const requestedRange = request.headers.get('range');
    const range = parseRange(requestedRange, metadata.size);
    if (range === 'invalid') return rangeError(metadata.size);
    const blob = await get(recording.blobPathname, {
      access: 'private', token, abortSignal: request.signal,
      ...(requestedRange ? { headers: { Range: requestedRange } } : {}),
    });
    if (!blob || blob.statusCode === 304) return new NextResponse('Recording not found', { status: 404 });
    const contentRange = blob.headers.get('content-range');
    const isPartial = Boolean(contentRange && requestedRange);
    const headers = new Headers({
      'Content-Type': metadata.contentType,
      'Content-Disposition': contentDisposition(recording.originalFilename),
      'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
    });
    const length = blob.headers.get('content-length');
    if (length) headers.set('Content-Length', length);
    if (contentRange) headers.set('Content-Range', contentRange);
    return new NextResponse(blob.stream, { status: isPartial ? 206 : 200, headers });
  } catch (error) {
    console.error('Unable to stream voice recording', error);
    return new NextResponse('Unable to load recording audio', { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
