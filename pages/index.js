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
        expression: `folder="c1fd31ee5a88243c9b5e192a5b9bb82bfd"`,
        nextCursor: nextCursor,  
        max_results: 30,
      })
    }).then(r => r.json());
  
    const { resources, next_cursor } = results;
      
    const images = mapImageResources(resources);
    
    // Injecting the q_50 string to decrease the quality of the photo from cloudinary
    images.map(imgDoc => {
      let url = imgDoc.image;
      
      if (url.indexOf("q_50") > 0) {
        return;
      }
  
      let index = url.indexOf("image/upload");
      let prefix = url.substr(0, index + "image/upload/".length);
      let q = "q_50/"
      let rest = url.substr(index+ "image/upload/".length)
  
      imgDoc.image = prefix + q + rest;
    })

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
  const results = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image?max_results=30&folder="c1fd31ee5a88243c9b5e192a5b9bb82bfd`, {
    headers: {
      Authorization: `Basic ${Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64')}`,
    },
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
