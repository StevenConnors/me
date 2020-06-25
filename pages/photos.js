import ImageGallery from '../components/imageGallery'
import { getAllImageUrls } from '../lib/staticDataFetcher'
import Header from '../components/header'

export async function getStaticProps() {
  const cloudinaryUrls = await getAllImageUrls();
  const urls = cloudinaryUrls.map(element => {
    return element.url;
  });

// https://res.cloudinary.com/dwsenj1bp/image/upload/q_10/v1593042912/yuji/aesthetic/IMG_5628_c428jq.jpg 
// Low quality url : q_10
// https://res.cloudinary.com/dwsenj1bp/image/upload/v1593042912/yuji/aesthetic/IMG_5628_c428jq.jpg
// normal quality url

  return {
    props: {
      urls,
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