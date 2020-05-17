import { useRouter } from 'next/router'
import styles from '../../components/main.module.css'
import Head from 'next/head'
import Link from 'next/link'
import { getImageDescription, getImages } from "../../lib/staticDataFetcher"

// Define for the router what the valid [filename]s are. We use the value from /public/images for valid filenames.
export async function getStaticPaths() {
  const paths = getImages().map(imgName => ({
    params: { filename: imgName },
  }))

  return {
    paths: paths,
    fallback: false 
  };
}


export async function getStaticProps({ params }) {
  const imageDescription = getImageDescription(params.filename)
  return {
    props: {
      imageDescription
    }
  }
}

export default function ImageInfo({ imageDescription}) {
  const router = useRouter()
  const { filename } = router.query

  return (
    <>
      <Head>
        <title>yuji tanaka</title>
      </Head>

      <Link href="/">  
        <h1>佑治</h1>
      </Link>


      <div className={`${styles.container} ${styles.columns}`}>
        <img
          src={`/images/${filename}`}
          className={styles.imgDetailed}
        />

        <p>{imageDescription.fileContents}</p>

      </div>
    </>
  )
}

