import ImageGallery from '../components/imageGallery'
import { ALL_PHOTOS_FOLDER } from '../lib/staticDataFetcher'
import Header from '../components/header'

export async function getStaticProps() {
  return {
    props: {
      imgNameToThumbNail: await getImageNameToThumbNailUrl(ALL_PHOTOS_FOLDER),
    }
  }
}

export default function allPhotos({ imgNameToThumbNail }) {
  return (
    <>
      <Header />

      <ImageGallery imgNameToThumbNail={imgNameToThumbNail} />
    </>
  )
}