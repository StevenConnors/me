'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import styles from '@/app/admin/admin.module.css';
import { uploadMedia } from '@/lib/client/upload-media';

type UploadState = 'idle' | 'authorizing' | 'uploading' | 'finalizing' | 'complete' | 'error';

export function MediaUploadPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [message, setMessage] = useState('');

  async function upload(file: File) {
    setState('authorizing');
    setMessage(`Preparing ${file.name}…`);
    try {
      await uploadMedia(file, {
        onPhase: (phase) => {
          setState(phase);
          setMessage(phase === 'uploading' ? `Uploading ${file.name}…` : 'Saving media details…');
        },
      });

      setState('complete');
      setMessage(`${file.name} is ready in the media library.`);
      router.refresh();
    } catch (error) {
      console.error(error);
      setState('error');
      setMessage(error instanceof Error ? error.message : 'The upload did not complete. Try again.');
    }
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>New image</p>
      <p className={styles.empty}>Choose a photograph to upload directly from this browser. Its storage path stays out of your writing workflow.</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.currentTarget.value = '';
        }}
      />
      <button
        className={styles.button}
        type="button"
        disabled={state !== 'idle' && state !== 'complete' && state !== 'error'}
        onClick={() => inputRef.current?.click()}
      >
        Upload image
      </button>
      {state !== 'idle' && <p className={styles.status} data-state={state === 'error' ? 'error' : undefined}>{message}</p>}
    </section>
  );
}
