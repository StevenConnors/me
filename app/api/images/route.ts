import { mapImageResources } from '../../../lib/cloudinary';
import { CLOUDINARY_IMAGE_FOLDER_ID } from '../../../config';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const results = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image?max_results=30&folder="${CLOUDINARY_IMAGE_FOLDER_ID}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64')}`,
      },
    }).then(r => r.json());
    
    let { resources } = results;
    const images = mapImageResources(resources);

    return NextResponse.json(images);
  } catch (error) {
    console.error('Error fetching images:', error);
    return NextResponse.json([], { status: 500 });
  }
}
