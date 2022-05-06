
   
import Header from '../components/header'
import ImageGallery from '../components/imageGallery'
import clientPromise from '../lib/mongodb'

export default function Home({ isConnected, images }) {
  return (
    <>
      <Header />

        {isConnected ? (
          <h2 className="subtitle">You are connected to MongoDB</h2>
        ) : (
          <h2 className="subtitle">
            You are NOT connected to MongoDB. Check the <code>README.md</code>{' '}
            for instructions.
          </h2>
        )}

      <ImageGallery images={images} />
    </>
  )
}

export async function getServerSideProps(context) {
  try {
    await clientPromise
    // `await clientPromise` will use the default database passed in the MONGODB_URI
    // However you can use another database (e.g. myDatabase) by replacing the `await clientPromise` with the following code:
    //
    // `const client = await clientPromise`
    // `const db = client.db("myDatabase")`
    //
    // Then you can execute queries against your database like so:
    // db.find({}) or any of the MongoDB Node Driver commands

    const client = await clientPromise;
    const db = client.db('test');
    const col = db.collection("col");

    const res = await col
      .find({})
      .toArray();
    return {
      props: { 
        isConnected: true,
        images: JSON.parse(JSON.stringify(res))
      },
    }
  } catch (e) {
    console.error(e)
    return {
      props: { 
        isConnected: false,
        res: []
      },
    }
  }
}