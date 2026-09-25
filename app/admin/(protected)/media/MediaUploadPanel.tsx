'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import styles from '@/app/admin/admin.module.css';
import { uploadMedia } from '@/lib/client/upload-media';

type UploadState = 'idle' | 'authorizing' | 'uploading' | 'finalizing' | 'complete' | 'error';

function uploadNoun(files: File[]) {
  if (files.every((file) => file.type.startsWith('image/'))) return files.length === 1 ? 'photo' : 'photos';
  if (files.every((file) => file.type.startsWith('video/'))) return files.length === 1 ? 'video' : 'videos';
  return files.length === 1 ? 'file' : 'files';
}

export function MediaUploadPanel({ onUploaded }: { onUploaded?: () => void } = {}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [message, setMessage] = useState('');
  const [completedCount, setCompletedCount] = useState(0);

  async function upload(files: File[]) {
    const noun = uploadNoun(files);
    let completed = 0;
    const failures: string[] = [];
    setCompletedCount(0);
    setState('authorizing');
    setMessage(`Preparing ${files.length} file${files.length === 1 ? '' : 's'}…`);
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        await uploadMedia(file, {
          onPhase: (phase) => {
            setState(phase);
            setMessage(`${completed} of ${files.length} ${noun} uploaded successfully. ${phase === 'uploading' ? `Uploading ${file.name}` : phase === 'finalizing' ? `Saving ${file.name}` : `Preparing ${file.name}`}…`);
          },
        });
        completed += 1;
        setCompletedCount(completed);
        setMessage(`${completed} of ${files.length} ${noun} uploaded successfully.${index + 1 < files.length ? ` Preparing next file…` : ''}`);
        if (onUploaded) onUploaded(); else router.refresh();
      } catch (error) {
        console.error(error);
        failures.push(file.name);
        setMessage(`${completed} of ${files.length} ${noun} uploaded successfully. ${failures.length} failed; continuing…`);
      }
    }
    setState(failures.length ? 'error' : 'complete');
    setMessage(`${completed} of ${files.length} ${noun} uploaded successfully.${failures.length ? ` Failed: ${failures.join(', ')}. Try uploading those again.` : ' New uploads are at the top of the library.'}`);
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>New media</p>
      <p className={styles.empty}>Choose photographs or videos to upload directly from this browser. Their storage paths stay out of your writing workflow.</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
        hidden
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) void upload(files);
          event.currentTarget.value = '';
        }}
      />
      <button
        className={styles.button}
        type="button"
        disabled={state !== 'idle' && state !== 'complete' && state !== 'error'}
        onClick={() => inputRef.current?.click()}
      >
        Upload images or videos
      </button>
      {state !== 'idle' && <p className={`${styles.status} ${styles.uploadStatus}`} data-state={state === 'error' ? 'error' : state === 'complete' ? 'saved' : undefined} role="status">{message} {completedCount > 0 && (state === 'complete' || state === 'error') ? <a href="#media-library">View newest uploads ↓</a> : null}</p>}
    </section>
  );
}
