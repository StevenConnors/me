import styles from '../../components/imageGallery.module.css'
import { getAllImageSuffixes, getImageDescription, getImageUrlFromSuffix } from "../../lib/staticDataFetcher"
import Tag from '../../components/tag'
import Header from '../../components/header'

/*
TODOs: getStaticPaths:
- Need to get the list of photo file names as I uploaded, in the form (IMG_2145)
- '/dwsenj1bp/image/upload/v1593042822/yuji/aesthetic/IMG_1999_gr4ske.jpg',
- On the individual image page, we should give a higher resolution than q_30
- Get the approriate imageDescription  .md file for the text.
- Render the tags
 */

// Define for the router what the valid [filename]s are. 
export async function getStaticPaths() {
  const imgNames = await getAllImageSuffixes();  
  const paths = imgNames.map(imgName => ({
    params: { filename: imgName },
  }))

  return {
    paths: paths,
    fallback: false 
  };
}

// Obtain the props to render, in this case the image description .md file.
export async function getStaticProps({ params }) {

  const imageDescription = getImageDescription(params.filename);

  let imageUrl = await getImageUrlFromSuffix(params.filename);

  return {
    props: {
      imageDescription,
      fullImageUrl: imageUrl,
    }
  } 
}

export default function ImageInfo({ imageDescription, fullImageUrl }) {
  console.log(imageDescription);
  return (
    <>
      <Header />

      <div className={`${styles.container} ${styles.columns}`}>
        <img
          src={`${process.env.assetPrefix}${fullImageUrl}`}
          className={styles.imgDetailed}
          loading="lazy"
        />
        <p>{imageDescription.content}</p>
      </div>

      {/* Render tags */}
      {imageDescription.tags.map(tag => (
          <Tag tag={tag} />
      ))}

    {/* <iframe width="425" height="350" frameborder="0" scrolling="no" marginheight="0" marginwidth="0" src="https://www.openstreetmap.org/export/embed.html?bbox=-79.97377395629884%2C40.413365349070865%2C-79.91197586059572%2C40.475680726483795&amp;layer=mapnik&amp;marker=40.444530259240274%2C-79.94287490844727"></iframe><br/><small><a href="https://www.openstreetmap.org/?mlat=40.4445&amp;mlon=-79.9429#map=13/40.4445/-79.9429">View Larger Map</a></small> */}
    </>
  )
}