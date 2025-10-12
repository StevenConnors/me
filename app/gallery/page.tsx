import Header from '../../components/header'
import ImageGallery from '../../components/ImageGallery';

export default function Gallery() {
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
          <ImageGallery />
        </div>
      </div>
    </>
  );
}
