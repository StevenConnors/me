import { mapImageResources } from '../lib/cloudinary';
import { CLOUDINARY_IMAGE_FOLDER_ID } from '../config';
import Header from '../components/header'
import ImageGallery from '../components/imageGallery';
import {useState} from 'react'
import Link from 'next/link'
import fs from 'fs'
import path from 'path'

export default function About({defaultImages, stories}) {
  const [images, setImages] = useState(defaultImages);
  return (
    <>
      <Header />
      
      <br></br>
      <br></br>

      <div>
        The name 佑治 means  &#39;heal the person to your right&#39;. Whoever you may be, I hope I can be that person for you.
      </div>

      <div>
        <h2>Travel Stories</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '2rem' }}>
          {stories.map((story) => (
            <Link 
              key={story.slug} 
              href={`/stories/${story.slug}`}
              style={{ textDecoration: 'none' }}
            >
              <div 
                style={{ 
                  cursor: 'pointer',
                  color: 'black',
                  fontSize: '1.5rem',
                  fontWeight: '300',
                  letterSpacing: '0.05em'
                }}
                onMouseEnter={(e) => e.target.style.color = '#009900'}
                onMouseLeave={(e) => e.target.style.color = 'black'}
              >
                {story.title}
              </div>
            </Link>
          ))}
        </div>
      </div>

      <br></br>
      <br></br>

      <div>
        <h2>And here's some one off photos</h2>
        <ImageGallery images={images}></ImageGallery>
      </div>
    </>
  )
}

export async function getStaticProps() {
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

  const results = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image?max_results=30&folder="${CLOUDINARY_IMAGE_FOLDER_ID}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64')}`,
    },
  }).then(r => r.json());
  
  let { resources, next_cursor } = results;
  const images = mapImageResources(resources);

  return {
    props: {
      defaultImages: images,
      defaultNextCursor: next_cursor || null,  // Ensure defaultNextCursor is never undefined
      stories
    }
  }
}
