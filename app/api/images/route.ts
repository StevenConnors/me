import { mapImageResources } from '../../../lib/cloudinary';
import { CLOUDINARY_IMAGE_FOLDER_ID } from '../../../config';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    let url = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image?max_results=${limit}&folder="${CLOUDINARY_IMAGE_FOLDER_ID}`;
    
    if (cursor) {
      url += `&next_cursor=${cursor}`;
    }
    
    const results = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64')}`,
      },
    }).then(r => r.json());
    
    const { resources, next_cursor } = results;
    const images = mapImageResources(resources);

    return NextResponse.json({
      images,
      nextCursor: next_cursor,
      hasMore: !!next_cursor
    });
  } catch (error) {
    console.error('Error fetching images:', error);
    return NextResponse.json({ images: [], nextCursor: null, hasMore: false }, { status: 500 });
  }
}
