import 'server-only';

import { isE2ETestMode } from '@/lib/e2e/test-mode';
import { E2EMediaProvider } from '@/lib/media/providers/E2EMediaProvider';
import { CloudinaryProvider, MediaProviderError } from '@/lib/media/providers/CloudinaryProvider';

export function getCloudinaryMediaProvider() {
  if (isE2ETestMode()) return new E2EMediaProvider();

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new MediaProviderError(
      'MEDIA_NOT_CONFIGURED',
      'Cloudinary server credentials are not configured',
    );
  }

  return new CloudinaryProvider({
    cloudName,
    apiKey,
    apiSecret,
    uploadFolder: process.env.CLOUDINARY_EDITOR_UPLOAD_FOLDER ?? 'journey-editor',
  });
}
