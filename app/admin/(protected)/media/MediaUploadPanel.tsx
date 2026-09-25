'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import styles from '@/app/admin/admin.module.css';
import { uploadMedia } from '@/lib/client/upload-media';

type UploadState = 'idle' | 'authorizing' | 'uploading' | 'finalizing' | 'complete' | 'error';

export function MediaUploadPanel({ onUploaded }: { onUploaded?: () => void } = {}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [message, setMessage] = useState('');

  async function upload(files: File[]) {
    setState('authorizing');
    setMessage(`Preparing ${files.length} file${files.length === 1 ? '' : 's'}…`);
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        await uploadMedia(file, {
          onPhase: (phase) => {
            setState(phase);
            setMessage(`${index + 1} of ${files.length}: ${phase === 'uploading' ? `Uploading ${file.name}` : phase === 'finalizing' ? `Saving ${file.name}` : `Preparing ${file.name}`}…`);
          },
        });
      }
      setState('complete');
      setMessage(`${files.length} file${files.length === 1 ? ' is' : 's are'} ready in the media library.`);
      if (onUploaded) onUploaded(); else router.refresh();
    } catch (error) {
      console.error(error);
      setState('error');
      setMessage(error instanceof Error ? error.message : 'The upload did not complete. Try again.');
    }
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
      {state !== 'idle' && <p className={styles.status} data-state={state === 'error' ? 'error' : undefined}>{message}</p>}
    </section>
  );
}
