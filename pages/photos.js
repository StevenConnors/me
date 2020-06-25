import ImageGallery from '../components/imageGallery'
import { getAllImageUrlsForThumbnails } from '../lib/staticDataFetcher'
import Header from '../components/header'

export async function getStaticProps() {
  return {
    props: {
      urls: await getAllImageUrlsForThumbnails(),
    }
  }
}

export default function allPhotos({ urls }) {
  return (
    <>
      <Header />

      <ImageGallery urls={urls} />
    </>
  )
}