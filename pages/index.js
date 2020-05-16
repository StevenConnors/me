import Head from 'next/head'
import { getImages } from '../lib/posts'
import styles from '../styles/main.module.css'

export async function getStaticProps() {
  const imgNames = getImages()
  return {
    props: {
      imgNames
    }
  }
}

export default function Home({ imgNames }) {
  return (
    <>
      <Head>
        <title>yuji tanaka</title>
      </Head>

      <h1> yuji tanaka </h1>
      
      <div className={`${styles.container} ${styles.columns}`}>
        {imgNames.map(imgName => (
          <picture key={imgName}>
            <img
              src={`/images/${imgName}`}
              className={styles.img}
            />
          </picture>
        ))}
      </div>
    </>
  )
}