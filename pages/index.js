import Head from 'next/head'
import { getImages } from '../lib/posts'

export async function getServerSideProps() {
  const imgNames = getImages()
  return {
    props: {
      imgNames
    }
  }
}

export default function Home({ imgNames }) {
  return (
    <>
      <Head>
        <title>yuji tanaka</title>
      </Head>

      <h1> yuji tanaka </h1>

      <div className="container columns">
        {imgNames.map(imgName => (
          <picture key={imgName}>
            <img
              src={`/images/${imgName}`}
              className=".img"
            />
          </picture>
        ))}
      </div>
    </>
  )
}