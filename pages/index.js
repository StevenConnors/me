import Header from '../components/header'
import ImageGallery from '../components/imageGallery'
import { ISE_PHOTOS_FOLDER, getImageNameToThumbNailUrl } from '../lib/staticDataFetcher'

export async function getStaticProps() {
  return {
    props: {
      imgNameToThumbNail: await getImageNameToThumbNailUrl(ISE_PHOTOS_FOLDER),
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