import Link from 'next/link'
import styles from './imageGallery.module.css'

export default function ImageGallery({ imgNames }) {
  return (
    <>
      <div className={`${styles.container} ${styles.columns}`}>
        {imgNames.map(imgName => (
          <Link href={`/img/${imgName}`} key={imgName}>  
            <picture key={imgName}>
              <img
                src={`/images/${imgName}`}
                className={styles.img}
                loading="lazy" 
              />
            </picture>
          </Link>
        ))}
      </div>
    </>
  )
}
