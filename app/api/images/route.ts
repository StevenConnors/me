import { mapImageResources } from '../../../lib/cloudinary';
import { CLOUDINARY_IMAGE_FOLDER_ID } from '../../../config';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    // Debug environment variables
    console.log('API Environment check:', {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      cloudNameLength: process.env.CLOUDINARY_CLOUD_NAME?.length,
      hasApiKey: !!process.env.CLOUDINARY_API_KEY,
      apiKeyLength: process.env.CLOUDINARY_API_KEY?.length,
      hasApiSecret: !!process.env.CLOUDINARY_API_SECRET,
      apiSecretLength: process.env.CLOUDINARY_API_SECRET?.length,
      folderId: CLOUDINARY_IMAGE_FOLDER_ID,
      allEnvVars: Object.keys(process.env).filter(key => key.includes('CLOUDINARY'))
    });
    
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('Missing Cloudinary environment variables');
      return NextResponse.json({ 
        error: 'Missing Cloudinary configuration',
        images: [], 
        nextCursor: null, 
        hasMore: false 
      }, { status: 500 });
    }
    
    let url = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image?max_results=${limit}&folder="${CLOUDINARY_IMAGE_FOLDER_ID}`;
    
    if (cursor) {
      url += `&next_cursor=${cursor}`;
    }
    
    console.log('Cloudinary API URL:', url);
    
    const results = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64')}`,
      },
    }).then(r => r.json());
    
    console.log('Cloudinary API response:', { 
      resourceCount: results.resources?.length || 0,
      hasNextCursor: !!results.next_cursor,
      error: results.error
    });
    
    const { resources, next_cursor } = results;
    const images = mapImageResources(resources);

    return NextResponse.json({
      images,
      nextCursor: next_cursor,
      hasMore: !!next_cursor
    });
  } catch (error) {
    console.error('Error fetching images:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      images: [], 
      nextCursor: null, 
      hasMore: false 
    }, { status: 500 });
  }
}
