import Link from 'next/link'
import styles from './imageGallery.module.css'
import Image from 'next/image'

export default function ImageGallery({ images }) {
  if (images === undefined) {
    return (<></>);
  }

  
  return (
    <>
      <div className={`${styles.container} ${styles.columns}`}>
        {images.map((imgDoc, index) => (
          <Link href={`/images/${imgDoc.title}`}> 
            <Image
              key={imgDoc.title}
              width={imgDoc.width} 
              height={imgDoc.height}
              className={styles.imge}
              src={imgDoc.image}
              alt={index}
            />
          </Link>
        ))}
      </div>
    </>
  )
}
