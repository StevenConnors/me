import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
// import exif from 'exif'
import cloudinary from "cloudinary";

require('dotenv').config()

const IMG_DIR = path.join(process.cwd(), 'public/images');
const POSTS_DIR = path.join(process.cwd(), 'imageDescriptions')

export function getAllImageNames() {
  // Get file names under /images
  return fs.readdirSync(IMG_DIR).filter(f => f != ".DS_Store")
}

export async function getAestheticImageUrls() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET   
  });

  let res = cloudinary.v2.search
    .expression('folder=yuji/aesthetic')
    .sort_by('public_id','desc')
    .max_results(50)
    .execute()
    .then(result=> {
      return result.resources; 
    });
  return res;
}

export async function getAllImageUrls() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET   
  });

  let res = cloudinary.v2.search
    .expression('folder=yuji/allPhotos')
    .sort_by('public_id','desc')
    .execute()
    .then(result=> {
      return result.resources; 
    });
  return res;
}

export function getAllTags() {
  // Get file names under /images and compute the tags
  let imageNames = fs.readdirSync(IMG_DIR).filter(f => f != ".DS_Store")

  let allTags = [];
  imageNames.map(imgName => {
    let imgDescription = getImageDescription(imgName);
    if (imgDescription.tags) {
      for (let tag of imgDescription.tags) {
        allTags.push(tag);
      }
    }
  })
  return allTags;
}

export function getAllImageNamesWithTag(tag) {
  let imageNames = fs.readdirSync(IMG_DIR).filter(f => f != ".DS_Store")

  let imagesWithTag = [];
  imageNames.map(imgName => {
    let imgDescription = getImageDescription(imgName);
    if (imgDescription.tags) {
      for (let imageTag of imgDescription.tags) {
        if (imageTag == tag) {
          imagesWithTag.push(imgName);
        }
      }
    }
  })
  return imagesWithTag;
}

export function getImageDescription(filename) {
  const mdFileName = filename.replace(/\.jpg$/, ".md")
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