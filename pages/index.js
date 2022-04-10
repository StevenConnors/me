import Header from '../components/header'
// import { BY_EVENTS_DIR, getPhotosByEvents, getEventDescription} from '../lib/staticDataFetcher'

export async function getStaticProps() {

  // getEventDescription()

  return {
    props: {
    //     events: await getPhotosByEvents(BY_EVENTS_DIR),
    }
  }
}

export default function Home({ events }) {
  return (
    <>
      <Header />

    </>
  )
}
