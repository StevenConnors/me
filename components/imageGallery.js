import Link from 'next/link'
import styles from './imageGallery.module.css'

export default function ImageGallery({ imgNameToThumbNail }) {
  return (
    <>
      <div> Hello!</div>
      <div className={`${styles.container} ${styles.columns}`}>
        {imgNameToThumbNail.map((imgNameToUrl, i) => (
            <Link href={`/img/${imgNameToUrl.imgName}`} key={imgNameToUrl.thumbNailUrl}> 
              <picture key={imgNameToUrl.thumbNailUrl}>
                <img
                  src={`${process.env.assetPrefix}${imgNameToUrl.thumbNailUrl}`}
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
