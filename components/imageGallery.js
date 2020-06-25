import Link from 'next/link'
import styles from './imageGallery.module.css'

export default function ImageGallery({ imgNames, urls }) {
  return (
    <>
      <div className={`${styles.container} ${styles.columns}`}>
        {urls.map(url => (
            <Link href={`/img/${url}`} key={url}>  
              <picture key={url}>
                <img
                  src={`${process.env.assetPrefix}${url}`}
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
