import ImageGallery from '../components/imageGallery'
import { AESTHETIC_PHOTOS_FOLDER, getImageNameToThumbNailUrl } from '../lib/staticDataFetcher'
import Header from '../components/header'

export async function getStaticProps() {
  return {
    props: {
      imgNameToThumbNail: await getImageNameToThumbNailUrl(AESTHETIC_PHOTOS_FOLDER),
    }
  }
}

export default function Home({ imgNameToThumbNail }) {
  return (
    <>
      <Header />

      <br></br>
      Welcome, here's some photos I like.

      <ImageGallery imgNameToThumbNail={imgNameToThumbNail} />
    </>
  )
}