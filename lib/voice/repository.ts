import { randomUUID } from 'node:crypto';
import { ObjectId, type Collection } from 'mongodb';

import { getVoiceCollections } from '@/lib/db/collections';
import { isE2ETestMode } from '@/lib/e2e/test-mode';
import type { VoiceMetadata, VoiceRecording, VoiceSegment } from '@/lib/voice/schema';

const CLAIM_LEASE_MS = 15 * 60 * 1000;

export class VoiceConflictError extends Error {}
export class VoiceNotFoundError extends Error {}

export class VoiceRepository {
  private static indexesReady: Promise<void> | null = null;
  private constructor(private readonly recordings: Collection<VoiceRecording>) {}

  static async connect() {
    const { voiceRecordings } = await getVoiceCollections();
    this.indexesReady ??= Promise.all([
      voiceRecordings.createIndex({ blobPathname: 1 }, { unique: true }),
      voiceRecordings.createIndex({ ownerId: 1, status: 1, uploadedAt: -1 }),
    ]).then(() => undefined);
    await this.indexesReady;
    return new VoiceRepository(voiceRecordings);
  }

  private id(value: string) { return new ObjectId(value).toHexString(); }

  async listOwned(ownerId: string) {
    return this.recordings.find({ ownerId }).sort({ uploadedAt: -1, createdAt: -1 }).limit(200).toArray();
  }

  async findOwned(recordingId: string, ownerId: string) {
    return this.recordings.findOne({ _id: this.id(recordingId), ownerId });
  }

  private workerOwnerId() {
    const ownerId = isE2ETestMode() ? 'e2e-author' : process.env.ADMIN_GITHUB_ID?.trim();
    if (!ownerId) throw new Error('ADMIN_GITHUB_ID is not configured');
    return ownerId;
  }

  async listPending(limit: number) {
    const now = new Date();
    const ownerId = this.workerOwnerId();
    return this.recordings.find({
      ownerId,
      status: { $in: ['pending', 'processing'] },
      $or: [
        { status: 'pending' },
        { status: 'processing', leaseExpiresAt: { $lte: now } },
      ],
    }).sort({ uploadedAt: 1, createdAt: 1 }).limit(limit).toArray();
  }

  async reserve(ownerId: string, metadata: VoiceMetadata, pathname: string) {
    const id = this.id(metadata.recordingId);
    const existing = await this.recordings.findOne({ _id: id });
    if (existing) {
      if (existing.ownerId !== ownerId || existing.blobPathname !== pathname || existing.byteSize !== metadata.byteSize ||
        existing.originalFilename !== metadata.originalFilename || existing.mimeType !== metadata.mimeType ||
        existing.title !== (metadata.title || metadata.originalFilename.replace(/\.[^.]+$/, '')) || existing.notes !== metadata.notes) {
        throw new VoiceConflictError('Recording ID has already been reserved');
      }
      return existing;
    }
    const now = new Date();
    const record: VoiceRecording = {
      _id: id,
      ownerId,
      title: metadata.title || metadata.originalFilename.replace(/\.[^.]+$/, ''),
      notes: metadata.notes,
      blobPathname: pathname,
      originalFilename: metadata.originalFilename,
      mimeType: metadata.mimeType,
      byteSize: metadata.byteSize,
      createdAt: now,
      updatedAt: now,
      status: 'uploading',
    };
    try {
      await this.recordings.insertOne(record);
      return record;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const raced = await this.recordings.findOne({ _id: id });
      if (raced?.ownerId === ownerId && raced.blobPathname === pathname && raced.byteSize === metadata.byteSize &&
        raced.originalFilename === metadata.originalFilename && raced.mimeType === metadata.mimeType) return raced;
      throw new VoiceConflictError('Recording ID has already been reserved');
    }
  }

  async finalize(recordingId: string, ownerId: string, blobUrl: string, byteSize: number, contentType: string) {
    const id = this.id(recordingId);
    const current = await this.recordings.findOne({ _id: id, ownerId });
    if (!current) throw new VoiceNotFoundError('Recording not found');
    if (current.status !== 'uploading') {
      if (current.blobUrl === blobUrl && current.byteSize === byteSize && current.mimeType === contentType) return current;
      throw new VoiceConflictError('Recording is no longer awaiting upload completion');
    }
    const now = new Date();
    const result = await this.recordings.findOneAndUpdate(
      { _id: id, ownerId, status: 'uploading' },
      { $set: { blobUrl, byteSize, mimeType: contentType, uploadedAt: now, updatedAt: now, status: 'pending' } },
      { returnDocument: 'after' },
    );
    if (result.value) return result.value;
    const after = await this.recordings.findOne({ _id: id, ownerId });
    if (after?.status !== 'uploading' && after?.blobUrl === blobUrl && after?.byteSize === byteSize && after?.mimeType === contentType) return after;
    throw new VoiceConflictError('Recording changed during upload completion');
  }

  async claim(recordingId: string, force = false) {
    const ownerId = this.workerOwnerId();
    const now = new Date();
    const claimId = randomUUID();
    const query: Record<string, unknown> = {
      _id: this.id(recordingId),
      ownerId,
      $or: [
        { status: 'pending' },
        { status: 'processing', leaseExpiresAt: { $lte: now } },
        ...(force ? [{ status: { $in: ['completed', 'failed'] } }] : []),
      ],
    };
    const result = await this.recordings.findOneAndUpdate(query, {
      $set: { status: 'processing', claimId, leaseExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS), updatedAt: now },
      $unset: { transcriptionError: '' },
    }, { returnDocument: 'after' });
    if (!result.value) {
      const exists = await this.recordings.findOne({ _id: this.id(recordingId), ownerId });
      if (!exists || !exists.blobUrl) throw new VoiceNotFoundError('Recording not found');
      throw new VoiceConflictError('Recording cannot be claimed while it is being processed or is already complete');
    }
    return { recording: result.value, claimId, leaseExpiresAt: result.value.leaseExpiresAt! };
  }

  async heartbeat(recordingId: string, claimId: string) {
    const ownerId = this.workerOwnerId();
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + CLAIM_LEASE_MS);
    const result = await this.recordings.findOneAndUpdate({
      _id: this.id(recordingId), ownerId, status: 'processing', claimId, leaseExpiresAt: { $gt: now },
    }, { $set: { leaseExpiresAt, updatedAt: now } }, { returnDocument: 'after' });
    if (!result.value) throw new VoiceConflictError('Transcription claim is missing or expired');
    return result.value;
  }

  async submit(recordingId: string, claimId: string, transcript: {
    text: string; language?: string; model: string; durationSeconds?: number; segments?: VoiceSegment[];
  }) {
    const ownerId = this.workerOwnerId();
    const current = await this.recordings.findOne({ _id: this.id(recordingId), ownerId });
    if (!current) throw new VoiceNotFoundError('Recording not found');
    if (current.status === 'completed' && current.lastCompletedClaimId === claimId) {
      const same = current.transcriptText === transcript.text && current.transcriptionModel === transcript.model &&
        current.transcriptLanguage === transcript.language && current.durationSeconds === transcript.durationSeconds &&
        JSON.stringify(current.segments ?? []) === JSON.stringify(transcript.segments ?? []);
      if (same) return current;
      throw new VoiceConflictError('This claim has already completed with different transcript data');
    }
    const now = new Date();
    const result = await this.recordings.findOneAndUpdate({
      _id: this.id(recordingId), ownerId, status: 'processing', claimId, leaseExpiresAt: { $gt: now },
    }, { $set: {
      status: 'completed', transcriptText: transcript.text, transcriptLanguage: transcript.language,
      transcriptionModel: transcript.model, durationSeconds: transcript.durationSeconds,
      segments: transcript.segments, transcribedAt: now, updatedAt: now, lastCompletedClaimId: claimId,
    }, $unset: { claimId: '', leaseExpiresAt: '', transcriptionError: '' } }, { returnDocument: 'after' });
    if (result.value) return result.value;
    const after = await this.recordings.findOne({ _id: this.id(recordingId), ownerId });
    if (after?.status === 'completed' && after.lastCompletedClaimId === claimId) {
      const same = after.transcriptText === transcript.text && after.transcriptionModel === transcript.model &&
        after.transcriptLanguage === transcript.language && after.durationSeconds === transcript.durationSeconds &&
        JSON.stringify(after.segments ?? []) === JSON.stringify(transcript.segments ?? []);
      if (same) return after;
      throw new VoiceConflictError('This claim has already completed with different transcript data');
    }
    throw new VoiceConflictError('Transcription claim is missing or expired');
  }

  async fail(recordingId: string, claimId: string, error: string) {
    const ownerId = this.workerOwnerId();
    const now = new Date();
    const result = await this.recordings.findOneAndUpdate({
      _id: this.id(recordingId), ownerId, status: 'processing', claimId, leaseExpiresAt: { $gt: now },
    }, { $set: { status: 'failed', transcriptionError: error, updatedAt: now }, $unset: { claimId: '', leaseExpiresAt: '' } }, { returnDocument: 'after' });
    if (!result.value) throw new VoiceConflictError('Transcription claim is missing or expired');
    return result.value;
  }
}
