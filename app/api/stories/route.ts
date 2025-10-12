import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Get stories from content/stories directory
    const storiesDirectory = path.join(process.cwd(), 'content/stories');
    const storyFiles = fs.readdirSync(storiesDirectory);
    
    const stories = storyFiles
      .filter(file => file.endsWith('.mdx'))
      .map(file => {
        const slug = file.replace('.mdx', '');
        // Read the first line to get the title (assuming it's in h1 format)
        const filePath = path.join(storiesDirectory, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const titleMatch = content.match(/<h1[^>]*>(.*?)<\/h1>/);
        const title = titleMatch ? titleMatch[1] : slug;
        
        return {
          slug,
          title
        };
      });

    return NextResponse.json(stories);
  } catch (error) {
    console.error('Error fetching stories:', error);
    return NextResponse.json([], { status: 500 });
  }
}
