import { mapImageResources } from '../../lib/cloudinary';
import { CLOUDINARY_IMAGE_FOLDER_ID } from '../../config';
import Header from '../../components/header'
import ImageGallery from '../../components/imageGallery';

export default async function Gallery() {
  const results = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image?max_results=100&folder="${CLOUDINARY_IMAGE_FOLDER_ID}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64')}`,
    },
  }).then(r => r.json());
  
  let { resources, next_cursor } = results;
  const images = mapImageResources(resources);

  return (
    <>
      <Header />
      
      <div style={{ padding: '2rem 0' }}>
        <h1 style={{ 
          fontSize: '2.5rem', 
          fontWeight: '300', 
          marginBottom: '2rem',
          textAlign: 'center'
        }}>
          Photo Gallery
        </h1>
        
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1rem' }}>
          <ImageGallery images={images} />
        </div>
      </div>
    </>
  );
}
