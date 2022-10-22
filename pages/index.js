import Header from '../components/header'
import Image from 'next/image'

export default function About() {
  return (
    <>
      <Header />
      
      <br></br>
      <br></br>

      <div>
        The name 佑治 means  &#39;heal the person to your right&#39;. Whoever you may be, I hope I can be that person for you.
      </div>

      <Image
        src="https://res.cloudinary.com/dwsenj1bp/image/upload/v1666357771/new/IMG_7197_kzfdbv.jpg"
        alt="asdfasdfsadf of a triangle"
        width={500}
        height={500}
      />
    </>
  )
}