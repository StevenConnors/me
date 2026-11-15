'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import styles from './recordings.module.css';
import { finalizeVoiceMemo, getPendingVoiceMemoFinalizationIds, MAX_VOICE_MEMO_BYTES, uploadVoiceMemo, VoiceUploadError } from '@/lib/client/upload-voice';

type RecordingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'uploading';
type RecordingSegment = { start: number; end: number; text: string };
type Recording = {
  _id: string;
  title: string;
  notes?: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  uploadedAt?: string;
  createdAt: string;
  status: RecordingStatus;
  transcriptText?: string;
  transcriptLanguage?: string;
  transcriptionModel?: string;
  transcribedAt?: string;
  durationSeconds?: number;
  segments?: RecordingSegment[];
  error?: string;
};

const AUDIO_ACCEPT = '.m4a,.aac,.mp3,.wav,.flac,.ogg,.webm,.mp4,audio/mp4,audio/aac,audio/mpeg,audio/wav,audio/flac,audio/ogg,audio/webm';
const STATUS_LABEL: Record<RecordingStatus, string> = {
  pending: 'Pending', processing: 'Processing', completed: 'Completed', failed: 'Failed', uploading: 'Uploading',
};

function dateLabel(value?: string): string {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function sizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Size unavailable';
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MiB`;
}

function validSegment(segment: unknown): segment is RecordingSegment {
  if (!segment || typeof segment !== 'object') return false;
  const value = segment as Partial<RecordingSegment>;
  return Number.isFinite(value.start) && Number.isFinite(value.end) && value.start! >= 0 && value.start! <= 315_360_000 && value.end! >= value.start! && typeof value.text === 'string';
}

function timeLabel(seconds: number): string {
  const value = Math.floor(seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remaining = value % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

function SegmentTranscript({ segments, audioRef }: { segments: RecordingSegment[]; audioRef: React.RefObject<HTMLAudioElement | null> }) {
  return (
    <div className={styles.transcriptBody}>
      <ol className={styles.segments}>
        {segments.filter(validSegment).map((segment, index) => (
          <li key={`${segment.start}-${index}`}>
            <button className={styles.timestamp} type="button" onClick={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = segment.start;
                void audioRef.current.play().catch(() => undefined);
              }
            }}>{timeLabel(segment.start)}</button>
            <span>{segment.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RecordingCard({ recording, onCopy, onRetryFinalize }: {
  recording: Recording;
  onCopy: (id: string, text: string) => Promise<void>;
  onRetryFinalize: (id: string) => Promise<void>;
}) {
  const [copyMessage, setCopyMessage] = useState('');
  const [idCopyMessage, setIdCopyMessage] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);
  const segments = Array.isArray(recording.segments) ? recording.segments.filter(validSegment) : [];
  const hasTranscript = typeof recording.transcriptText === 'string' && recording.transcriptText.length > 0;

  async function copy() {
    if (!recording.transcriptText) return;
    try {
      await onCopy(recording._id, recording.transcriptText);
      setCopyMessage('Transcript copied.');
    } catch {
      setCopyMessage('Copy was blocked. Select the transcript text and copy it manually.');
    }
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(recording._id);
      setIdCopyMessage('Recording ID copied.');
    } catch {
      setIdCopyMessage('Select the recording ID and copy it manually.');
    }
  }

  async function retryFinalize() {
    setRetrying(true);
    setRetryMessage('');
    try {
      await onRetryFinalize(recording._id);
      setRetryMessage('Recording saved.');
    } catch (error) {
      setRetryMessage(error instanceof Error ? error.message : 'The recording could not be saved yet.');
    } finally {
      setRetrying(false);
    }
  }

  return (
    <article className={styles.card} data-recording-id={recording._id}>
      <div className={styles.cardHeading}>
        <div>
          <h3>{recording.title || recording.originalFilename}</h3>
          <p className={styles.filename}>{recording.originalFilename}</p>
        </div>
        <span className={styles.badge} data-status={recording.status}>{STATUS_LABEL[recording.status] ?? 'Pending'}</span>
      </div>
      <div className={styles.metadata}>
        <span>Uploaded {dateLabel(recording.uploadedAt ?? recording.createdAt)}</span>
        <span>{sizeLabel(recording.byteSize)}</span>
        {recording.transcriptionModel ? <span>{recording.transcriptionModel}{recording.transcriptLanguage ? ` · ${recording.transcriptLanguage}` : ''}</span> : null}
      </div>
      <div className={styles.recordingId}>
        <span>Recording ID</span>
        <code>{recording._id}</code>
        <button className={styles.idCopyButton} type="button" onClick={() => void copyId()}>Copy recording ID</button>
        {idCopyMessage ? <span className={styles.idCopyMessage} role="status">{idCopyMessage}</span> : null}
      </div>
      {recording.notes ? <p className={styles.notes}>{recording.notes}</p> : null}
      <audio ref={audioRef} className={styles.audio} controls preload="metadata" src={`/api/voice/recordings/${encodeURIComponent(recording._id)}/audio`} aria-label={`Play ${recording.title}`} />
      {recording.status === 'uploading' ? <div className={styles.recovery}>
        <p>This audio may have uploaded before the recording was saved.</p>
        <button className={styles.secondaryButton} type="button" disabled={retrying} onClick={() => void retryFinalize()}>{retrying ? 'Saving…' : 'Retry saving recording'}</button>
        {retryMessage ? <span role="status">{retryMessage}</span> : null}
      </div> : null}
      {recording.status === 'failed' && recording.error ? <p className={styles.failure} role="status">Transcription failed: {recording.error}</p> : null}
      {hasTranscript ? (
        <section className={styles.transcript} aria-label={`Transcript for ${recording.title}`}>
          <div className={styles.transcriptHeading}>
            <h4>Transcript</h4>
            <button className={styles.secondaryButton} type="button" onClick={() => void copy()}>Copy transcript</button>
          </div>
          <textarea aria-label={`Transcript text for ${recording.title}`} className={styles.transcriptText} readOnly value={recording.transcriptText} rows={Math.min(12, Math.max(4, recording.transcriptText!.split('\n').length))} />
          {copyMessage ? <p className={styles.copyMessage} role="status">{copyMessage}</p> : null}
          {segments.length ? <SegmentTranscript segments={segments} audioRef={audioRef} /> : null}
        </section>
      ) : recording.status === 'completed' ? <p className={styles.muted}>Transcription completed with no transcript text.</p> : null}
    </article>
  );
}

export function RecordingsWorkspace({ e2eUploads = false }: { e2eUploads?: boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState(false);
  const [retryId, setRetryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState('');
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    const requestNumber = ++requestSequence.current;
    setRefreshError('');
    try {
      const response = await fetch('/api/admin/recordings', { cache: 'no-store' });
      let payload: unknown;
      try { payload = await response.json(); } catch { payload = null; }
      if (!response.ok) throw new Error('Recordings could not be loaded. Refresh the page or sign in again.');
      const rows = payload && typeof payload === 'object' && Array.isArray((payload as { recordings?: unknown }).recordings)
        ? (payload as { recordings: Recording[] }).recordings
        : null;
      if (!rows) throw new Error('The recordings response was not valid.');
      if (requestNumber === requestSequence.current) setRecordings(rows);
    } catch (error) {
      if (requestNumber === requestSequence.current) setRefreshError(error instanceof Error ? error.message : 'Recordings could not be loaded.');
    } finally {
      if (requestNumber === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const pendingIds = getPendingVoiceMemoFinalizationIds();
    if (pendingIds.length) {
      setRetryId(pendingIds[0]);
      setUploadMessage('An uploaded voice memo still needs to be saved. Retry finalization below.');
      setUploadError(true);
    }
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!recordings.some((recording) => recording.status === 'processing')) return;
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [recordings, refresh]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || uploading) return;
    setUploading(true);
    setProgress(0);
    setUploadError(false);
    setRetryId(null);
    setUploadMessage('Preparing upload…');
    try {
      const id = await uploadVoiceMemo(selectedFile, { title, notes }, {
        e2eUploads,
        onProgress: (value) => {
          setProgress(value);
          setUploadMessage(`Uploading original audio… ${value}%`);
        },
      });
      setUploadMessage('Voice memo uploaded.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTitle('');
      setNotes('');
      setRecordings((current) => current.filter((recording) => recording._id !== id));
      await refresh();
    } catch (error) {
      const canRetryFinalize = error instanceof VoiceUploadError && error.canRetryFinalize;
      setRetryId(canRetryFinalize ? error.recordingId ?? null : null);
      setUploadError(true);
      setUploadMessage(error instanceof Error ? error.message : 'The voice memo could not be uploaded. Try again.');
    } finally {
      setUploading(false);
    }
  }

  async function retryFinalize() {
    if (!retryId) return;
    setUploading(true);
    setUploadError(false);
    setUploadMessage('Saving the recording…');
    try {
      await finalizeVoiceMemo(retryId);
      setRetryId(null);
      setUploadMessage('Voice memo uploaded.');
      await refresh();
    } catch (error) {
      setUploadError(true);
      setUploadMessage(error instanceof Error ? error.message : 'The recording could not be saved yet.');
    } finally {
      setUploading(false);
    }
  }

  async function retryCardFinalize(recordingId: string) {
    await finalizeVoiceMemo(recordingId);
    setRetryId(null);
    await refresh();
  }

  async function copyTranscript(recordingId: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const field = document.querySelector<HTMLTextAreaElement>(`[data-recording-id="${CSS.escape(recordingId)}"] textarea`);
      if (!field) throw new Error('Transcript text is unavailable.');
      field.focus();
      field.select();
      if (!document.execCommand('copy')) throw new Error('Copy failed.');
    }
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.uploadPanel} aria-labelledby="voice-upload-title">
        <div>
          <p className={styles.eyebrow}>Capture</p>
          <h2 id="voice-upload-title">Upload a voice memo</h2>
          <p className={styles.description}>Choose an exported recording from Files or Voice Memos. M4A and AAC are supported, and the original audio is kept. Run the local Whisper worker on your Mac to transcribe it.</p>
        </div>
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <div className={styles.field}>
            <label htmlFor="voice-file">Audio file</label>
            <input ref={fileInputRef} id="voice-file" type="file" accept={AUDIO_ACCEPT} disabled={uploading} onChange={(event) => {
              setSelectedFile(event.currentTarget.files?.[0] ?? null);
              setUploadMessage('');
              setRetryId(null);
              event.currentTarget.value = '';
            }} />
            <span className={styles.help}>M4A, AAC, MP3, WAV, FLAC, OGG, WebM, or MP4 · up to {sizeLabel(MAX_VOICE_MEMO_BYTES)}</span>
          </div>
          {selectedFile ? <p className={styles.selectedFile}>{selectedFile.name} · {sizeLabel(selectedFile.size)}</p> : null}
          <div className={styles.field}>
            <label htmlFor="voice-title">Title</label>
            <span className={styles.optional}>(optional)</span>
            <input id="voice-title" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} disabled={uploading} />
          </div>
          <div className={styles.field}>
            <label htmlFor="voice-notes">Notes</label>
            <span className={styles.optional}>(optional)</span>
            <textarea id="voice-notes" value={notes} maxLength={5000} onChange={(event) => setNotes(event.target.value)} disabled={uploading} rows={3} />
          </div>
          <div className={styles.formActions}>
            <button className={styles.primaryButton} type="submit" disabled={!selectedFile || uploading}>Upload Voice Memo</button>
            {retryId ? <button className={styles.secondaryButton} type="button" disabled={uploading} onClick={() => void retryFinalize()}>Retry saving recording</button> : null}
          </div>
          {uploading && !e2eUploads ? <progress className={styles.progress} max={100} value={progress} aria-label="Upload progress" /> : null}
          {uploadMessage ? <p className={styles.uploadMessage} data-error={uploadError || undefined} role="status">{uploadMessage}</p> : null}
        </form>
      </section>

      <section id="recording-list" className={styles.listSection} aria-labelledby="recordings-title">
        <div className={styles.listHeading}>
          <div>
            <p className={styles.eyebrow}>Your library</p>
            <h2 id="recordings-title">Voice memos</h2>
          </div>
          <button className={styles.secondaryButton} type="button" onClick={() => void refresh()} disabled={loading}>Refresh recordings</button>
        </div>
        {refreshError ? <p className={styles.listError} role="alert">{refreshError}</p> : null}
        {loading ? <p className={styles.empty} role="status">Loading recordings…</p>
          : recordings.length ? <div className={styles.recordingList}>{recordings.map((recording) => <RecordingCard key={recording._id} recording={recording} onCopy={copyTranscript} onRetryFinalize={retryCardFinalize} />)}</div>
            : <p className={styles.empty}>No voice memos yet. Upload one above to get started.</p>}
      </section>
    </div>
  );
}
