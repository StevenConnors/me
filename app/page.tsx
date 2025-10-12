'use client';
import Header from '../components/header'
import ImageGallery from '../components/ImageGallery';
import MyLink from '../components/MyLink';
import { useState, useEffect } from 'react'

interface Story {
  slug: string;
  title: string;
}

export default function Home() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch stories from API
        const storiesRes = await fetch('/api/stories');
        const storiesData = await storiesRes.json();
        setStories(storiesData);
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
            <MyLink key={story.slug} href={`/stories/${story.slug}`}>
              {story.title}
            </MyLink>
          ))}
        </div>
      </div>

      <br></br>
      <br></br>

      <div>
        <h2>And here's some one off photos</h2>
        <ImageGallery />
      </div>
    </>
  )
}