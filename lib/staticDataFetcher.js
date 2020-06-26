import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
// import exif from 'exif'
import cloudinary from "cloudinary";

const POSTS_DIR = path.join(process.cwd(), 'imageDescriptions')

export const ALL_PHOTOS_FOLDER = "yuji/allPhotos";
export const AESTHETIC_PHOTOS_FOLDER = "yuji/aesthetic";

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

export async function getImageUrlsForThumbnails(folder) {
  let cloudinaryUrls = await getImageUrls(folder);
  return cloudinaryUrls.map(removeUrlPrefix).map(decreaseImageQualityURL);
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

export async function getImageUrls(folder) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET   
  });

  let res = cloudinary.v2.search
    .expression(`folder=${folder}`)
    .sort_by('public_id','desc')
    .execute()
    .then(result=> {
      return result.resources; 
    });    
  return res;
}


// export function getAllTags() {
//   // Get file names under /images and compute the tags
//   let imageNames = fs.readdirSync(IMG_DIR).filter(f => f != ".DS_Store")

//   let allTags = [];
//   imageNames.map(imgName => {
//     let imgDescription = getImageDescription(imgName);
//     if (imgDescription.tags) {
//       for (let tag of imgDescription.tags) {
//         allTags.push(tag);
//       }
//     }
//   })
//   return allTags;
// }

// export function getAllImageNamesWithTag(tag) {
//   let imageNames = fs.readdirSync(IMG_DIR).filter(f => f != ".DS_Store")

//   let imagesWithTag = [];
//   imageNames.map(imgName => {
//     let imgDescription = getImageDescription(imgName);
//     if (imgDescription.tags) {
//       for (let imageTag of imgDescription.tags) {
//         if (imageTag == tag) {
//           imagesWithTag.push(imgName);
//         }
//       }
//     }
//   })
//   return imagesWithTag;
// }

export function getImageDescription(filename) {
  const mdFileName = filename + ".md";
  const fullPath = POSTS_DIR+"/"+mdFileName;

  let fileContents;
  try {
    fileContents = fs.readFileSync(fullPath, 'utf8');
  } catch (err) {
    // If .md file does not exist for image, render empty
    return { 
      fullPath: fullPath, 
      content: "", 
      tags: [],
    }
  }

  // getExifData(filename)

  const matterResult = matter(fileContents)
  let content = matterResult.content;

  return {
    fullPath,
    content,
    ...matterResult.data,
  }
}

// function getExifData(filename) {
//   let exifData;
//   try {
//       exifData = new exif.ExifImage({ image : IMG_DIR+"/"+ filename }, function (error, exifData) {
//           if (error)
//               console.log('Error: '+error.message);
//           else
//               console.log(exifData);
//       });
//   } catch (error) {
//       console.log('Error: ' + error.message);
//   }
// }