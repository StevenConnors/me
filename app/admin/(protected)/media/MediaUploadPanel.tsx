'use client';

import { useRef, useState } from 'react';

import styles from '@/app/admin/admin.module.css';

type UploadState = 'idle' | 'authorizing' | 'uploading' | 'finalizing' | 'complete' | 'error';

type CloudinaryAuthorization = {
  uploadUrl: string;
  parameters: Record<string, string | number | boolean>;
};

function toProviderResult(result: Record<string, unknown>) {
  return {
    providerAssetId: result.asset_id,
    providerPublicId: result.public_id,
    resourceType: result.resource_type,
    deliveryType: result.type,
    version: result.version,
    originalFilename: result.original_filename ?? result.public_id,
    format: result.format,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    checksum: result.etag,
    tags: result.tags ?? [],
    signature: result.signature,
  };
}

export function MediaUploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [message, setMessage] = useState('');

  async function upload(file: File) {
    const idempotencyKey = crypto.randomUUID().replace(/-/g, '');
    setState('authorizing');
    setMessage(`Preparing ${file.name}…`);
    try {
      const authorizationResponse = await fetch('/api/admin/media/upload-authorizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          bytes: file.size,
          idempotencyKey,
          resourceType: 'image',
        }),
      });
      const authorizationPayload = await authorizationResponse.json();
      if (!authorizationResponse.ok) throw new Error(authorizationPayload.error?.message ?? 'Upload could not be prepared');
      const authorization = authorizationPayload.authorization as CloudinaryAuthorization;

      setState('uploading');
      setMessage(`Uploading ${file.name}…`);
      const formData = new FormData();
      for (const [key, value] of Object.entries(authorization.parameters)) {
        formData.append(key, String(value));
      }
      formData.append('file', file);
      const providerResponse = await fetch(authorization.uploadUrl, { method: 'POST', body: formData });
      const providerPayload = await providerResponse.json();
      if (!providerResponse.ok) throw new Error(providerPayload.error?.message ?? 'Cloudinary rejected the file');

      setState('finalizing');
      setMessage('Saving media details…');
      const finalizationResponse = await fetch('/api/admin/media/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey, result: toProviderResult(providerPayload) }),
      });
      const finalizationPayload = await finalizationResponse.json();
      if (!finalizationResponse.ok) throw new Error(finalizationPayload.error?.message ?? 'The upload needs finalizing again');

      setState('complete');
      setMessage(`${file.name} is ready in the media library.`);
      window.setTimeout(() => window.location.reload(), 650);
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
