import Head from 'next/head'
import Link from 'next/link'

export default function About() {
  return (
    <>
      <Head>
        <title>yuji tanaka</title>
      </Head>
      <Link href="/">  
        <h1>佑治</h1>
      </Link>

      <div>
        About this - its just a place where I store my photos.
      </div>
    </>
  )
}