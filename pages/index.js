import Header from '../components/header'
import ImageGallery from '../components/imageGallery'
import cloudinary from "cloudinary";

export async function getServerSideProps() {
  let urls = await getImageNameToThumbNailUrl(ISE_DIR);
  
  return {
    props: {
        imgNameToThumbNail: urls,
    }
  }
}

export default function Home({ imgNameToThumbNail }) {
  return (
    <>
      <Header />

      <ImageGallery imgNameToThumbNail={imgNameToThumbNail} />
    </>
  )
}

export const ISE_DIR = "yuji/ise";

export async function getImageNameToThumbNailUrl(folder) {
  let cloudinaryUrls = await getImageUrls(folder);

  const imgNameToThumbNailUrl = cloudinaryUrls.map(imgJson => {
    let filename = imgJson.filename;
    let imgSuffix = filename.substring(0, filename.lastIndexOf("_"));
    let thumbNailUrl = decreaseImageQualityURL(removeUrlPrefix(imgJson));

    return {imgName: imgSuffix, thumbNailUrl: thumbNailUrl};
  });
  return imgNameToThumbNailUrl;
  // Return json of {IMG_1244: ThumbNailUrlForIMG_1244}
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


function removeUrlPrefix(imgJson) {
  return imgJson.secure_url.substring('https://res.cloudinary.com'.length);
}

function decreaseImageQualityURL(url) {
  let uploadIndex = url.indexOf("upload/");
  let beforeTransformationString = url.substring(0, uploadIndex + "upload/".length);
  let afterTransformationString = url.substring(uploadIndex + "upload/".length);
  let lQurl = `${beforeTransformationString}q_20/${afterTransformationString}`;
  return lQurl
};
