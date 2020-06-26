import Header from '../components/header'
import ImageGallery from '../components/imageGallery'
import { ALL_PHOTOS_FOLDER, getImageNameToThumbNailUrl } from '../lib/staticDataFetcher'

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