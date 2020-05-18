import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const IMG_DIR = path.join(process.cwd(), 'public/images');
const POSTS_DIR = path.join(process.cwd(), 'imageDescriptions')

export function getImages() {
  // Get file names under /images
  return fs.readdirSync(IMG_DIR).filter(f => f != ".DS_Store")
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

  return {
    fullPath,
    ...matterResult.data,
    fileContents
  }
}