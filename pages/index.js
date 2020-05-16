import Head from 'next/head'
import MainComponent from '../components/main'
import { getImages } from '../lib/posts'

export async function getStaticProps() {
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
      <MainComponent imgNames={imgNames}></MainComponent>
    </>
  )
}