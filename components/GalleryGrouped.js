export default function GalleryGrouped({ images }) {
  return (
    <div style={{ textAlign: 'center', marginTop: '2rem' }}>
      <h2>Grouped by Event View (Coming Soon)</h2>
      <p>This view will group images by event or trip.</p>
      <p>Total images: {images.length}</p>
    </div>
  );
} 