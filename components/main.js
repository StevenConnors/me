import Head from 'next/head'
import Link from 'next/link'
import styles from './main.module.css'

export default function MainComponent({ imgNames }) {
  return (
    <>
      <Head>
        <title>yuji tanaka</title>
      </Head>

      <h1>佑治</h1>

      <div className={`${styles.container} ${styles.columns}`}>
        {imgNames.map(imgName => (
          <Link href={`/img/${imgName}`}>  
            <picture key={imgName}>
              <img
                src={`/images/${imgName}`}
                className={styles.img}
              />
            </picture>
          </Link>
        ))}
      </div>
    </>
  )
}
