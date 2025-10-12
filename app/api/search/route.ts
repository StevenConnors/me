import { search } from '../../../lib/cloudinary';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const params = await request.json();
    
    const results = await search(params);
    
    return NextResponse.json({ ...results });
  } catch (error) {
    console.error('Error in search API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
