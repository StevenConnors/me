import Link from 'next/link'
import styles from './imageGallery.module.css'
import Image from 'next/image'

export default function ImageGallery({ images }) {
  return (
    <>
      <div className={`${styles.container} ${styles.columns}`}>
        {images.map(imgDoc => (
          <Link href={`/img/${imgDoc.title}`} key={imgDoc.title}>  
              <Image
              width={imgDoc.width} height={imgDoc.height}
                className={styles.img}
                loading="lazy" 
                src={imgDoc.image}
              />
          </Link>
        ))}
      </div>
    </>
  )
}
