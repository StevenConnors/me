import Head from 'next/head'
import Link from 'next/link'
import styles from './main.module.css'
import Header from "./header"

export default function MainComponent({ imgNames }) {
  return (
    <>
      <Header />

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
