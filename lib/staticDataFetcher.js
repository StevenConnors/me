import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const IMG_DIR = path.join(process.cwd(), 'public/images');
const POSTS_DIR = path.join(process.cwd(), 'imageDescriptions')

export function getAllImageNames() {
  // Get file names under /images
  return fs.readdirSync(IMG_DIR).filter(f => f != ".DS_Store")
}

export function getAllTags() {
  // Get file names under /images and compute the tags
  let imageNames = fs.readdirSync(IMG_DIR).filter(f => f != ".DS_Store")

  let allTags = [];
  imageNames.map(imgName => {
    let imgDescription = getImageDescription(imgName);

    console.log(imgDescription);
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
    return { fileContents: ""}
  }

  const matterResult = matter(fileContents)
  let content = matterResult.content;

  return {
    fullPath,
    content,
    ...matterResult.data,
  }
}