import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { isE2ETestMode } from '@/lib/e2e/test-mode';

export const runtime = 'nodejs';

/** Simulates Cloudinary's browser upload response for the local E2E provider. */
export async function POST(request: Request) {
  if (!isE2ETestMode()) return new NextResponse(null, { status: 404 });

  const formData = await request.formData();
  const file = formData.get('file');
  const filename = file instanceof File && file.name ? file.name : 'sample-image.png';
  const bytes = file instanceof File ? file.size : 68;
  const providerAssetId = `e2e-${randomUUID()}`;

  return NextResponse.json({
    asset_id: providerAssetId,
    public_id: `e2e/${providerAssetId}`,
    resource_type: 'image',
    type: 'upload',
    version: 1,
    original_filename: filename,
    format: 'png',
    width: 1,
    height: 1,
    bytes,
    etag: 'e2e-checksum',
    tags: formData.get('tags'),
    signature: 'e2e-upload-signature',
  });
}
