import Link from 'next/link';
import Image from 'next/image';
import styles from './imageGallery.module.css';

export default function GalleryGrid({ images }) {
  return (
    <div className={`${styles.container} ${styles.columns}`}>
      {images.map((imgDoc, index) => (
        <Link href={`/images/${imgDoc.title}`} key={imgDoc.id || imgDoc.title+index} passHref>
          <div className={styles.imageWrapper}>
            <Image
              key={imgDoc.id || imgDoc.title+index}
              src={`https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto,c_fill,w_800/${imgDoc.image}`}
              alt={imgDoc.title || `Image ${index + 1}`}
              fill
              style={{ objectFit: 'cover', borderRadius: '4px' }}
              sizes="(max-width: 768px) 100vw, 33vw"
            />
          </div>
        </Link>
      ))}
    </div>
  );
} 