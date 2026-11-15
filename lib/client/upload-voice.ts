import { upload } from '@vercel/blob/client';

export const MAX_VOICE_MEMO_BYTES = 250 * 1024 * 1024;

const SUPPORTED_AUDIO: Record<string, { mimeType: string; extensions: string[] }> = {
  m4a: { mimeType: 'audio/mp4', extensions: ['m4a'] },
  aac: { mimeType: 'audio/aac', extensions: ['aac'] },
  mp3: { mimeType: 'audio/mpeg', extensions: ['mp3'] },
  wav: { mimeType: 'audio/wav', extensions: ['wav'] },
  flac: { mimeType: 'audio/flac', extensions: ['flac'] },
  ogg: { mimeType: 'audio/ogg', extensions: ['ogg'] },
  webm: { mimeType: 'audio/webm', extensions: ['webm'] },
  mp4: { mimeType: 'audio/mp4', extensions: ['mp4'] },
};

const MIME_TO_EXTENSION: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/x-aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/ogg': 'ogg',
  'application/ogg': 'ogg',
  'audio/webm': 'webm',
};

export type VoiceUploadMetadata = {
  recordingId: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  title: string;
  notes: string;
};

type PendingFinalization = VoiceUploadMetadata & { uploadedAt: string };

export class VoiceUploadError extends Error {
  canRetryFinalize: boolean;
  recordingId?: string;

  constructor(message: string, canRetryFinalize = false, recordingId?: string) {
    super(message);
    this.name = 'VoiceUploadError';
    this.canRetryFinalize = canRetryFinalize;
    this.recordingId = recordingId;
  }
}

function extensionForFile(file: File): { extension: string; mimeType: string } {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const fromExtension = SUPPORTED_AUDIO[extension];
  const mimeType = file.type.toLowerCase();
  const fromMimeType = MIME_TO_EXTENSION[mimeType];
  const genericMime = !file.type || file.type === 'application/octet-stream';
  const compatibleMime = fromMimeType === extension || (['audio/mp4', 'video/mp4'].includes(mimeType) && ['m4a', 'mp4'].includes(extension));

  if (!fromExtension || (!genericMime && !compatibleMime)) {
    throw new Error('Choose an M4A, AAC, MP3, WAV, FLAC, OGG, WebM, or MP4 audio file.');
  }
  if (!file.size) throw new Error('The selected audio file is empty.');
  if (file.size > MAX_VOICE_MEMO_BYTES) throw new Error('Choose an audio file smaller than 250 MiB.');

  return { extension, mimeType: fromExtension.mimeType };
}

function makeRecordingId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function errorMessage(payload: Record<string, unknown>, fallback: string): string {
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  const nestedError = payload.error && typeof payload.error === 'object' ? payload.error as Record<string, unknown> : null;
  return typeof nestedError?.message === 'string' && nestedError.message.trim() ? nestedError.message : fallback;
}

function pendingFinalizationKey(recordingId: string): string {
  return `voice-finalize:${recordingId}`;
}

export function getPendingVoiceMemoFinalizationIds(): string[] {
  try {
    return Object.keys(sessionStorage)
      .filter((key) => /^voice-finalize:[a-f\d]{24}$/i.test(key))
      .map((key) => key.slice('voice-finalize:'.length));
  } catch {
    return [];
  }
}

export async function finalizeVoiceMemo(recordingId: string): Promise<void> {
  const key = pendingFinalizationKey(recordingId);

  const response = await fetch('/api/admin/recordings/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordingId }),
  });
  const payload = await responseJson(response);
  if (!response.ok) throw new VoiceUploadError(errorMessage(payload, 'The audio uploaded, but its recording could not be saved yet.'), true, recordingId);

  try { sessionStorage.removeItem(key); } catch { /* The API result is authoritative if browser storage is unavailable. */ }
}

export async function uploadVoiceMemo(
  file: File,
  fields: { title: string; notes: string },
  options: { onProgress?: (percentage: number) => void; e2eUploads?: boolean } = {},
): Promise<string> {
  const { extension, mimeType } = extensionForFile(file);
  const metadata: VoiceUploadMetadata = {
    recordingId: makeRecordingId(),
    originalFilename: file.name,
    mimeType,
    byteSize: file.size,
    title: fields.title.trim() || file.name.replace(/\.[^.]+$/, ''),
    notes: fields.notes.trim(),
  };

  if (options.e2eUploads) {
    const formData = new FormData();
    formData.set('recordingId', metadata.recordingId);
    formData.set('originalFilename', metadata.originalFilename);
    formData.set('mimeType', metadata.mimeType);
    formData.set('byteSize', String(metadata.byteSize));
    formData.set('title', metadata.title);
    formData.set('notes', metadata.notes);
    formData.set('file', file, file.name);
    const response = await fetch('/api/e2e/voice-upload', { method: 'POST', body: formData });
    const payload = await responseJson(response);
    if (!response.ok) throw new Error(errorMessage(payload, 'The test upload failed.'));
    return metadata.recordingId;
  }

  options.onProgress?.(0);
  await upload(`voice/${metadata.recordingId}/original.${extension}`, file, {
    access: 'private',
    contentType: mimeType,
    handleUploadUrl: '/api/admin/recordings/upload',
    clientPayload: JSON.stringify(metadata),
    multipart: true,
    onUploadProgress: ({ percentage }) => options.onProgress?.(Math.round(percentage)),
  });

  try {
    sessionStorage.setItem(pendingFinalizationKey(metadata.recordingId), JSON.stringify({ ...metadata, uploadedAt: new Date().toISOString() } satisfies PendingFinalization));
  } catch { /* Finalization still works from the in-memory ID if storage is blocked. */ }
  try {
    await finalizeVoiceMemo(metadata.recordingId);
  } catch (error) {
    if (error instanceof VoiceUploadError) throw error;
    throw new VoiceUploadError('The audio uploaded, but its recording could not be saved yet. Retry saving the recording.', true, metadata.recordingId);
  }
  return metadata.recordingId;
}
