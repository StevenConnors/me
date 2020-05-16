import Head from 'next/head'
import styles from './main.module.css'

const name = 'Your Name'
export const siteTitle = 'Next.js Sample Website'

export default function MainComponent({ imgNames }) {
  console.log(imgNames);
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
