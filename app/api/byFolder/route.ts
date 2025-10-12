import { byFolder } from '../../../lib/cloudinary';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const params = await request.json();
    
    console.log({params});
    const results = await byFolder(params);
    
    console.log({results});
    
    return NextResponse.json({ ...results });
  } catch (error) {
    console.error('Error in byFolder API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
