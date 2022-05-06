import Image from 'next/image'
import image from '../public/img.jpeg'
import Header from '../components/header'


export default function Page() {
    return (
      <>
        <Header />

        <br></br>
        <br></br>

        <Image
          src={image}
          alt="Picture of the author"
          // width={500} automatically provided
          // height={500} automatically provided
          // blurDataURL="data:..." automatically provided
          // placeholder="blur" // Optional blur-up while loading
        />
      </>
    )
  }