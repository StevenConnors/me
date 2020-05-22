import { useRouter } from 'next/router'
import styles from '../../components/imageGallery.module.css'
import { getImageDescription, getAllImageNames } from "../../lib/staticDataFetcher"
import Tag from '../../components/tag'
import Header from '../../components/header'

// Define for the router what the valid [filename]s are. 
// We use the value from /public/images for valid filenames.
export async function getStaticPaths() {
  const paths = getAllImageNames().map(imgName => ({
    params: { filename: imgName },
  }))

  return {
    paths: paths,
    fallback: false 
  };
}

// Obtain the props to render.
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
      <Header />

      <div className={`${styles.container} ${styles.columns}`}>
        <img
          src={`/images/${filename}`}
          className={styles.imgDetailed}
        />

        <p>{imageDescription.content}</p>
      </div>

      {/* Render tags */}
      {imageDescription.tags.map(tag => (
          <Tag tag={tag} />
      ))}
    </>
  )
}

