import { search, mapImageResources } from '../lib/cloudinary';
import Header from '../components/header'
import ImageGallery from '../components/imageGallery';
import {useState} from 'react'

export default function About({defaultImages, defaultNextCursor}) {

  const [images, setImages] = useState(defaultImages);
  const [nextCursor, setNextCursor] = useState(defaultNextCursor)


  async function handleOnLoadMore(e) {
    e.preventDefault();
  
    const results = await fetch('/api/search', {
      method: 'POST',
      body: JSON.stringify({
        expression: `folder=""`,
        nextCursor: nextCursor,
      })
    }).then(r => r.json());
  
    const { resources, next_cursor } = results;
  
    console.log("nexPge", next_cursor);
    
    const images = mapImageResources(resources);
    
    setImages(prev => {
      return [
        ...prev,
        ...images
      ]
    });
    setNextCursor(next_cursor);    
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

      <div onClick={handleOnLoadMore}>Load More Results</div>
    </>
  )
}

export async function getStaticProps() {
  const results = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image`, {
    headers: {
      Authorization: `Basic ${Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64')}`
    }
  }).then(r => r.json());
  
  const { resources, next_cursor } = results;
  const images = mapImageResources(resources);

  return {
    props: {
      defaultImages: images,
      defaultNextCursor: next_cursor
    }
  }
}
