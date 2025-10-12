'use client';
import Header from '../components/header'
import ImageGallery from '../components/imageGallery';
import Link from 'next/link'
import { useState, useEffect } from 'react'

interface Story {
  slug: string;
  title: string;
}

interface Image {
  id: string;
  title: string;
  image: string;
}

export default function Home() {
  const [images, setImages] = useState<Image[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch stories from API
        const storiesRes = await fetch('/api/stories');
        const storiesData = await storiesRes.json();
        setStories(storiesData);

        // Fetch images from Cloudinary via API route
        const imagesRes = await fetch('/api/images');
        const imagesData = await imagesRes.json();
        setImages(imagesData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <>
        <Header />
        <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>
      </>
    );
  }

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
                onMouseEnter={(e) => (e.target as HTMLElement).style.color = '#009900'}
                onMouseLeave={(e) => (e.target as HTMLElement).style.color = 'black'}
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