import styles from '../../components/imageGallery.module.css'
// import { getAllImageSuffixes, getImageDescription, getImageUrlFromSuffix } from "../../lib/staticDataFetcher"
import Header from '../../components/header'
import cloudinary from "cloudinary";

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

//   const imageDescription = getImageDescription(params.filename);

  let imageUrl = await getImageUrlFromSuffix(params.filename);

  return {
    props: {
    //   imageDescription,
      fullImageUrl: imageUrl,
    }
  } 
}

export default function ImageInfo({ imageDescription, fullImageUrl }) {
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
    </>
  )
}



export async function getAllImageSuffixes() {
    let cloudinaryUrls = await getImageUrls(ALL_PHOTOS_FOLDER);
    const urls = cloudinaryUrls.map(imgJson => {
      let filename = imgJson.filename;
      let imgSuffix = filename.substring(0, filename.lastIndexOf("_"));
      return imgSuffix;
    });
    // Returns the list of filenames in the form IMG_1345
    return urls;
  }
  
  export async function getImageUrlFromSuffix(suf) {
    let cloudinaryUrls = await getImageUrls(ALL_PHOTOS_FOLDER);
    return cloudinaryUrls
      .filter(imgJson => imgJson.secure_url.indexOf(suf) > -1)
      .map(removeUrlPrefix)
  }
  


export async function getImageUrls(folder) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
      api_key: process.env.CLOUDINARY_API_KEY, 
      api_secret: process.env.CLOUDINARY_API_SECRET   
    });
  
    let res = cloudinary.v2.search
      .expression(`folder=${folder}/*`)
      .sort_by('public_id','desc')
      .execute()
      // .max_results(500)
      .then(result=> {
        return result.resources; 
      });    
    return res;
  }
  