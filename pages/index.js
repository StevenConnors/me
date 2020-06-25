import ImageGallery from '../components/imageGallery'
import { getAestheticImageUrlsForThumbnails } from '../lib/staticDataFetcher'
import Header from '../components/header'

export async function getStaticProps() {
  return {
    props: {
      urls: await getAestheticImageUrlsForThumbnails(),
    }
  }
}

export default function Home({ urls }) {
  return (
    <>
      <Header />

      <br></br>
      Welcome, here's some photos I like.

      <ImageGallery urls={urls} />
    </>
  )
}