import Link from 'next/link'
import styles from './imageGallery.module.css'

export default function ImageGallery({ images }) {
  return (
    <>
      <div className={`${styles.container} ${styles.columns}`}>
        {images.map(imgDoc => (
          <Link href={`/img/${imgDoc.title}`} key={imgDoc.title}>  
            <picture key={imgDoc.title}>
              <img
                className={styles.img}
                loading="lazy" 
                src={`data:image/jpeg;base64,${imgDoc.image}`}
                // src={`/images/${imgDoc}`}
              />
            </picture>
          </Link>
        ))}
      </div>
    </>
  )
}
