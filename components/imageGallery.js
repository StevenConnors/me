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
                src={url}
                className={styles.img}
                loading="lazy" 
              />
            </picture>
          </Link>
        ))}

{/* 
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
        ))} */}
      </div>
    </>
  )
}
