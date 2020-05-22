import ImageGallery from '../components/imageGallery'
import { getAllImageNames } from '../lib/staticDataFetcher'
import Header from '../components/header'

export async function getStaticProps() {
  const imgNames = getAllImageNames()
  return {
    props: {
      imgNames
    }
  }
}

export default function Home({ imgNames }) {
  return (
    <>
      <Header />

      <ImageGallery imgNames={imgNames} />
    </>
  )
}