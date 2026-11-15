import { z } from 'zod';

export const VOICE_MAX_BYTES = 250 * 1024 * 1024;
export const VOICE_ALLOWED_TYPES = {
  'audio/mp4': ['.m4a', '.mp4'],
  'audio/aac': ['.aac'],
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/x-wav': ['.wav'],
  'audio/flac': ['.flac'],
  'audio/ogg': ['.ogg'],
  'audio/webm': ['.webm'],
} as const;

export const VoiceSegmentSchema = z.object({
  start: z.number().finite().nonnegative().max(24 * 60 * 60),
  end: z.number().finite().nonnegative().max(24 * 60 * 60),
  text: z.string().max(10_000),
}).strict().refine((segment) => segment.end >= segment.start, 'Segment end must follow its start');

export const VoiceMetadataSchema = z.object({
  recordingId: z.string().regex(/^[a-f\d]{24}$/i),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(100).default(''),
  byteSize: z.number().int().positive().max(VOICE_MAX_BYTES),
  title: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(5_000).optional(),
}).strict();

export const VoiceTranscriptSchema = z.object({
  claimId: z.string().uuid(),
  text: z.string().trim().min(1).max(2_000_000),
  language: z.string().trim().min(2).max(32).optional(),
  model: z.string().trim().min(1).max(120),
  durationSeconds: z.number().finite().positive().max(24 * 60 * 60).optional(),
  segments: z.array(VoiceSegmentSchema).max(50_000).optional(),
}).strict();

export const VoiceFailureSchema = z.object({
  claimId: z.string().uuid(),
  error: z.string().trim().min(1).max(2_000),
}).strict();

export type VoiceSegment = z.infer<typeof VoiceSegmentSchema>;
export type VoiceMetadata = z.infer<typeof VoiceMetadataSchema>;
export type VoiceStatus = 'uploading' | 'pending' | 'processing' | 'completed' | 'failed';

export type VoiceRecording = {
  _id: string;
  ownerId: string;
  title?: string;
  notes?: string;
  blobUrl?: string;
  blobPathname: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  uploadedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  status: VoiceStatus;
  transcriptText?: string;
  transcriptLanguage?: string;
  transcriptionModel?: string;
  transcribedAt?: Date;
  durationSeconds?: number;
  segments?: VoiceSegment[];
  transcriptionError?: string;
  claimId?: string;
  leaseExpiresAt?: Date;
  lastCompletedClaimId?: string;
};

export function getVoiceFileExtension(filename: string): string | null {
  const extension = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (!extension) return null;
  return Object.values(VOICE_ALLOWED_TYPES).some((extensions) => extensions.includes(extension as never))
    ? extension
    : null;
}

export function normalizeVoiceMimeType(mimeType: string, filename: string): string | null {
  const ext = getVoiceFileExtension(filename);
  if (!ext) return null;
  const supplied = mimeType.toLowerCase().split(';', 1)[0]?.trim();
  const normalized = ({ 'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4', 'audio/x-aac': 'audio/aac', 'audio/x-wav': 'audio/wav', 'audio/mp3': 'audio/mpeg', 'audio/x-flac': 'audio/flac' } as Record<string, string>)[supplied] ?? supplied;
  // Voice Memos and iOS file providers sometimes omit the MIME type or report generic binary.
  if (!normalized || normalized === 'application/octet-stream' || normalized === 'binary/octet-stream') {
    return Object.entries(VOICE_ALLOWED_TYPES).find(([, extensions]) => extensions.includes(ext as never))?.[0] ?? null;
  }
  return Object.entries(VOICE_ALLOWED_TYPES).find(([type, extensions]) =>
    (type === normalized || (type === 'audio/mp4' && normalized === 'video/mp4')) && extensions.includes(ext as never),
  )?.[0] ?? null;
}
