import { getAllTags, getAllImageNamesWithTag } from "../../lib/staticDataFetcher"
import Header from '../../components/header'
import ImageGallery from '../../components/imageGallery'

export default function About() {
  return (
    <>
      <Header />
      
      <div>
      NYI
      </div>
    </>
  )
}

// Define for the router what the valid [tag]s are. We use the value from /public/images for valid filenames.
// export async function getStaticPaths() {
//   const paths = getAllTags().map(tag => ({
//     params: { tag: tag },
//   }))

//   return {
//     paths: paths,
//     fallback: false 
//   };
// }

// export async function getStaticProps({ params }) {
//   const allImageNamesWithTag = getAllImageNamesWithTag(params.tag)
//   return {
//     props: {
//       allImageNamesWithTag
//     }
//   }
// }

// export default function TagView({ allImageNamesWithTag }) {
//   return (
//     <>
//       <Header />

//       <ImageGallery imgNames={allImageNamesWithTag} />
//     </>
//   )
// }
