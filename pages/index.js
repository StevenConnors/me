import { mapImageResources } from '../lib/cloudinary';
import { CLOUDINARY_IMAGE_FOLDER_ID } from '../config';
import Header from '../components/header'
import ImageGallery from '../components/imageGallery';
import {useState} from 'react'

export default function About({defaultImages, defaultNextCursor}) {

  const [images, setImages] = useState(defaultImages);
  const [nextCursor, setNextCursor] = useState(defaultNextCursor)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleOnLoadMore(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const results = await fetch('/api/search', {
        method: 'POST',
        body: JSON.stringify({
          expression: `folder="${CLOUDINARY_IMAGE_FOLDER_ID}"`,
          nextCursor: nextCursor,  
          max_results: 30,
        })
      }).then(r => r.json());
    
      const { resources, next_cursor } = results;
      const images = mapImageResources(resources);
      setImages(prev => ([...prev, ...images]));
      setNextCursor(next_cursor);
    } catch (err) {
      setError('Failed to load more images.');
    } finally {
      setLoading(false);
    }
  }  

  return (
    <>
      <Header />
      
      <br></br>
      <br></br>

      <div>
        The name 佑治 means  &#39;heal the person to your right&#39;. Whoever you may be, I hope I can be that person for you.
      </div>

      <ImageGallery images={images}></ImageGallery>

      {error && <div style={{ color: 'red' }}>{error}</div>}
      <div onClick={handleOnLoadMore} style={{ cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}>
        {loading ? 'Loading...' : 'Load More Results'}
      </div>
    </>
  )
}

export async function getStaticProps() {
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
      defaultNextCursor: next_cursor || null  // Ensure defaultNextCursor is never undefined
    }
  }
}
