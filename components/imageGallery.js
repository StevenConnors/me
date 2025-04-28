import Link from 'next/link'
import styles from './imageGallery.module.css'
import Image from 'next/image'

export default function ImageGallery({ images }) {
  // console.log("images come like this:", images)
  if (images.length === 0) {
    return (<div style={{ textAlign: 'center' }}>No photos to display</div>);
  }
  return (
    <>
      <div className={`${styles.container} ${styles.columns}`}>
        {images.map((imgDoc, index) => (
          <Link href={`/images/${imgDoc.title}`} key={imgDoc.id || imgDoc.title+index} passHref>
            <div className={styles.imageWrapper}>
              <Image
                key={imgDoc.id || imgDoc.title+index}
                width={imgDoc.width}
                height={imgDoc.height}
                className={styles.image}
                src={imgDoc.image}
                alt={imgDoc.title || `Image ${index + 1}`}
                layout="responsive"
              />
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
