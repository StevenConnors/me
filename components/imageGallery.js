import Link from 'next/link'
import styles from './imageGallery.module.css'
import Image from 'next/image'
import GalleryGrid from './GalleryGrid';
import GalleryGrouped from './GalleryGrouped.js';

export default function ImageGallery({ images, viewType = 'grid' }) {
  // console.log("images come like this:", images)
  if (images.length === 0) {
    return (<div style={{ textAlign: 'center' }}>No photos to display</div>);
  }
  if (viewType === 'grouped') {
    return <GalleryGrouped images={images} />;
  }
  return <GalleryGrid images={images} />;
}
