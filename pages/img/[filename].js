// import { useRouter } from 'next/router'
// import styles from '../../components/imageGallery.module.css'
// import { getImageDescription, getAllImageNames } from "../../lib/staticDataFetcher"
// import Tag from '../../components/tag'
// import Header from '../../components/header'

import Header from '../../components/header'

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

// // Define for the router what the valid [filename]s are. 
// // We use the value from /public/images for valid filenames.
// export async function getStaticPaths() {
//   const paths = getAllImageNames().map(imgName => ({
//     params: { filename: imgName },
//   }))

//   return {
//     paths: paths,
//     fallback: false 
//   };
// }

// // Obtain the props to render.
// export async function getStaticProps({ params }) {
//   const imageDescription = getImageDescription(params.filename)
//   return {
//     props: {
//       imageDescription
//     }
//   } 
// }

// export default function ImageInfo({ imageDescription}) {
//   const router = useRouter()
//   const { filename } = router.query
//   return (
//     <>
//       <Header />

//       <div className={`${styles.container} ${styles.columns}`}>
//         <img
//           src={`/images/${filename}`}
//           className={styles.imgDetailed}
//         />

//         <p>{imageDescription.content}</p>
//       </div>

//       {/* Render tags */}
//       {imageDescription.tags.map(tag => (
//           <Tag tag={tag} />
//       ))}

//     {/* <iframe width="425" height="350" frameborder="0" scrolling="no" marginheight="0" marginwidth="0" src="https://www.openstreetmap.org/export/embed.html?bbox=-79.97377395629884%2C40.413365349070865%2C-79.91197586059572%2C40.475680726483795&amp;layer=mapnik&amp;marker=40.444530259240274%2C-79.94287490844727"></iframe><br/><small><a href="https://www.openstreetmap.org/?mlat=40.4445&amp;mlon=-79.9429#map=13/40.4445/-79.9429">View Larger Map</a></small> */}
//     </>
//   )
// }

