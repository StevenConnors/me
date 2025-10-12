import GalleryGrid from './GalleryGrid';

export default function ImageGallery({ images }) {
  if (images.length === 0) {
    return (<div style={{ textAlign: 'center' }}>No photos to display</div>);
  }

  return <GalleryGrid images={images} />;
}
